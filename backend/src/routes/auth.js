const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const rateLimit = require("express-rate-limit");

const User = require("../models/User");

const router = express.Router();

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

function signToken(user) {
  return jwt.sign(
    { sub: user._id.toString(), role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || "60m" }
  );
}

// POST /api/v1/auth/signup
router.post("/signup", authLimiter, async (req, res) => {
  const { email, password, role } = req.body || {};

  if (!email || !EMAIL_RE.test(email)) {
    return res.status(400).json({ message: "A valid email is required" });
  }
  if (!password || password.length < MIN_PASSWORD_LENGTH) {
    return res
      .status(400)
      .json({ message: `Password must be at least ${MIN_PASSWORD_LENGTH} characters` });
  }
  if (role && !["Creator", "Manager", "Admin"].includes(role)) {
    return res.status(400).json({ message: "Invalid role" });
  }

  try {
    const existing = await User.findOne({ email: email.toLowerCase() });
    if (existing) {
      return res.status(409).json({ message: "An account with this email already exists" });
    }

    const password_hash = await bcrypt.hash(password, 12);
    const user = await User.create({ email, password_hash, role });

    const token = signToken(user);
    res.status(201).json({
      token,
      user: { id: user._id, email: user.email, role: user.role },
    });
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
    if (!user) {
      return res.status(401).json({ message: "Invalid email or password" });
    }

    const matches = await bcrypt.compare(password, user.password_hash);
    if (!matches) {
      return res.status(401).json({ message: "Invalid email or password" });
    }

    const token = signToken(user);
    res.json({
      token,
      user: { id: user._id, email: user.email, role: user.role },
    });
  } catch (err) {
    res.status(500).json({ message: "Failed to log in" });
  }
});

module.exports = router;
