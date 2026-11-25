const express = require("express");
const bcrypt = require("bcryptjs");
const rateLimit = require("express-rate-limit");

const User = require("../models/User");
const { requireAuth, DEACTIVATED } = require("../middleware/auth");
const { startSession, signAccessToken, consumeRefreshToken, issueRefreshToken, endSession } = require("../services/sessions");
const { accountSummary, deleteAccount } = require("../services/accounts");
const { verifyGoogleCredential } = require("../services/googleAuth");
const { findManagerByCode } = require("../services/teams");

const router = express.Router();

const PROFILE_ROLES = ["Creator", "Manager"];

function publicUser(user) {
  return { id: user._id, email: user.email, role: user.role, name: user.name, manager_id: user.manager_id || null };
}


const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LENGTH = 8;

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  skip: () => process.env.NODE_ENV === "test",
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many attempts. Please try again later." },
});

// POST /api/v1/auth/signup
router.post("/signup", authLimiter, async (req, res) => {
  const { email, password, role, name, invite_code } = req.body || {};

  if (!email || !EMAIL_RE.test(email)) {
    return res.status(400).json({ message: "A valid email is required" });
  }
  if (!password || password.length < MIN_PASSWORD_LENGTH) {
    return res
      .status(400)
      .json({ message: `Password must be at least ${MIN_PASSWORD_LENGTH} characters` });
  }
  if (role && !PROFILE_ROLES.includes(role)) {
    return res.status(400).json({ message: "Invalid role" });
  }
  // Optional team code: only Creators join a Manager's team.
  let manager = null;
  if (invite_code) {
    if (role === "Manager") {
      return res.status(400).json({ message: "Only Creators can join a team" });
    }
    manager = await findManagerByCode(invite_code);
    if (!manager) {
      return res.status(400).json({ message: "That team code is not valid" });
    }
  }

  try {
    const existing = await User.findOne({ email: email.toLowerCase() });
    if (existing) {
      return res.status(409).json({ message: "An account with this email already exists" });
    }

    const password_hash = await bcrypt.hash(password, 12);
    const user = await User.create({
      email,
      password_hash,
      role,
      name: typeof name === "string" && name.trim() ? name.trim() : undefined,
      manager_id: manager ? manager._id : null,
    });

    const token = await startSession(req, res, user);
    res.status(201).json({ token, user: publicUser(user) });
  } catch (err) {
    res.status(500).json({ message: "Failed to create account" });
  }
});

// POST /api/v1/auth/login
router.post("/login", authLimiter, async (req, res) => {
  const { email, password } = req.body || {};

  if (!email || !password) {
    return res.status(400).json({ message: "Email and password are required" });
  }

  try {
    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user || !user.password_hash) {
      return res.status(401).json({ message: "Invalid email or password" });
    }

    const matches = await bcrypt.compare(password, user.password_hash);
    if (!matches) {
      return res.status(401).json({ message: "Invalid email or password" });
    }
    if (user.status === "deactivated") {
      return res.status(403).json(DEACTIVATED);
    }

    const token = await startSession(req, res, user);
    res.json({ token, user: publicUser(user) });
  } catch (err) {
    res.status(500).json({ message: "Failed to log in" });
  }
});

// POST /api/v1/auth/google
// Finds the account by Google ID, or by email (merging a Google sign-in into an
// existing email/password account), or creates one. New accounts must complete
// their profile before they're sent to the dashboard.
router.post("/google", authLimiter, async (req, res) => {
  const { credential } = req.body || {};
  if (!credential) {
    return res.status(400).json({ message: "A Google credential is required" });
  }

  let profile;
  try {
    profile = await verifyGoogleCredential(credential);
  } catch (err) {
    return res.status(401).json({ message: "Google sign-in could not be verified" });
  }
  if (!profile.emailVerified) {
    return res.status(401).json({ message: "This Google account's email is not verified" });
  }

  try {
    let user = await User.findOne({ google_id: profile.googleId });
    if (!user) {
      user = await User.findOne({ email: profile.email.toLowerCase() });
    }

    if (!user) {
      user = await User.create({
        email: profile.email,
        google_id: profile.googleId,
        name: profile.name,
        profile_complete: false,
      });
    } else if (!user.google_id) {
      user.google_id = profile.googleId;
      await user.save();
    } else if (user.google_id !== profile.googleId) {
      return res.status(409).json({ message: "This email is linked to a different Google account" });
    }
    if (user.status === "deactivated") {
      return res.status(403).json(DEACTIVATED);
    }

    res.json({
      token: await startSession(req, res, user),
      user: publicUser(user),
      needs_profile: !user.profile_complete,
    });
  } catch (err) {
    res.status(500).json({ message: "Failed to sign in with Google" });
  }
});

// PATCH /api/v1/auth/profile
// Completes a new Google account. Only allowed while the profile is incomplete,
// so a finished account can't use this to change its own role.
router.patch("/profile", requireAuth, async (req, res) => {
  const { name, role } = req.body || {};

  if (typeof name !== "string" || name.trim().length < 2) {
    return res.status(400).json({ message: "Name must be at least 2 characters" });
  }
  if (!PROFILE_ROLES.includes(role)) {
    return res.status(400).json({ message: "Choose Creator or Manager" });
  }

  try {
    const user = await User.findById(req.user.sub);
    if (!user) {
      return res.status(404).json({ message: "Account not found" });
    }
    if (user.profile_complete) {
      return res.status(403).json({ message: "Profile is already complete" });
    }

    user.name = name.trim();
    user.role = role;
    user.profile_complete = true;
    await user.save();

    res.json({ token: signAccessToken(user), user: publicUser(user), needs_profile: false });
  } catch (err) {
    res.status(500).json({ message: "Failed to save profile" });
  }
});

// POST /api/v1/auth/refresh
// Swaps the refresh-token cookie for a new access token (and a new cookie).
router.post("/refresh", async (req, res) => {
  try {
    const row = await consumeRefreshToken(req);
    if (!row) return res.status(401).json({ code: "SESSION_EXPIRED", message: "Please sign in again" });

    const user = await User.findById(row.user_id);
    if (!user) return res.status(401).json({ code: "ACCOUNT_DELETED", message: "This account no longer exists." });
    if (user.status === "deactivated") return res.status(403).json(DEACTIVATED);

    await issueRefreshToken(req, res, user);
    res.json({ token: signAccessToken(user), user: publicUser(user) });
  } catch (err) {
    res.status(500).json({ message: "Failed to refresh the session" });
  }
});

// POST /api/v1/auth/logout - ends this browser's session.
router.post("/logout", async (req, res) => {
  await endSession(req, res);
  res.status(204).end();
});

// GET /api/v1/auth/me - the signed-in user as stored now (live role, team, status).
router.get("/me", requireAuth, async (req, res) => {
  const user = await User.findById(req.user.sub);
  if (!user) return res.status(404).json({ message: "Account not found" });
  res.json({ user: publicUser(user), sign_in: user.password_hash ? "password" : "google" });
});

// GET /api/v1/auth/me/summary - what deleting your account would remove.
router.get("/me/summary", requireAuth, async (req, res) => {
  res.json(await accountSummary(req.user.sub));
});

// DELETE /api/v1/auth/me  { password } or, for Google-only accounts, { confirm_email }
// Creators and Managers can delete their own account (D-45). Admins can't, so
// the system is never left without one.
router.delete("/me", requireAuth, async (req, res) => {
  const user = await User.findById(req.user.sub);
  if (!user) return res.status(404).json({ message: "Account not found" });
  if (user.role === "Admin") {
    return res.status(403).json({ message: "Admin accounts can't be deleted here" });
  }

  const { password, confirm_email: confirmEmail } = req.body || {};
  if (user.password_hash) {
    if (!password || !(await bcrypt.compare(password, user.password_hash))) {
      return res.status(401).json({ message: "Password is incorrect" });
    }
  } else if (typeof confirmEmail !== "string" || confirmEmail.trim().toLowerCase() !== user.email) {
    return res.status(400).json({ message: "Type your email address to confirm" });
  }

  const removed = await deleteAccount(user._id);
  await endSession(req, res);
  res.json({ deleted: true, removed });
});

module.exports = router;
