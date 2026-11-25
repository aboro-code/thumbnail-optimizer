const crypto = require("crypto");
const jwt = require("jsonwebtoken");

const RefreshToken = require("../models/RefreshToken");

const REFRESH_COOKIE = "refresh_token";
const REFRESH_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const COOKIE_PATH = "/api/v1/auth";

function hash(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function signAccessToken(user) {
  return jwt.sign(
    { sub: user._id.toString(), role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || "60m" }
  );
}

// Secure cookies only over HTTPS. Behind Caddy -> nginx the backend sees
// X-Forwarded-Proto: https; plain-HTTP setups (localhost, APP_PORT=80) still work.
function isHttps(req) {
  return req.secure || req.get("x-forwarded-proto") === "https";
}

// Same site (Docker/nginx, or Vite + API on localhost): SameSite=Lax.
// Frontend and API on different domains (e.g. Vercel + Render): set
// COOKIE_SAMESITE=none, which browsers only accept together with Secure (HTTPS).
function cookieOptions(req) {
  const crossSite = (process.env.COOKIE_SAMESITE || "lax").toLowerCase() === "none";
  return {
    httpOnly: true,
    sameSite: crossSite ? "none" : "lax",
    secure: crossSite || isHttps(req),
    path: COOKIE_PATH,
    maxAge: REFRESH_TTL_MS,
  };
}

// Issues a new refresh token as an httpOnly cookie (JavaScript can't read it).
async function issueRefreshToken(req, res, user) {
  const token = crypto.randomBytes(32).toString("base64url");
  await RefreshToken.create({
    user_id: user._id,
    token_hash: hash(token),
    expires_at: new Date(Date.now() + REFRESH_TTL_MS),
  });
  res.cookie(REFRESH_COOKIE, token, cookieOptions(req));
}

// Starts a session: short-lived access token in the body, refresh token in a cookie.
async function startSession(req, res, user) {
  await issueRefreshToken(req, res, user);
  return signAccessToken(user);
}

function readRefreshCookie(req) {
  const header = req.headers.cookie || "";
  for (const part of header.split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name === REFRESH_COOKIE) return decodeURIComponent(rest.join("="));
  }
  return null;
}

// Single use: the presented token is deleted, so a stolen copy stops working
// as soon as the real browser refreshes (rotation).
async function consumeRefreshToken(req) {
  const token = readRefreshCookie(req);
  if (!token) return null;
  const row = await RefreshToken.findOneAndDelete({ token_hash: hash(token) });
  if (!row || row.expires_at < new Date()) return null;
  return row;
}

async function endSession(req, res) {
  const token = readRefreshCookie(req);
  if (token) await RefreshToken.deleteOne({ token_hash: hash(token) });
  res.clearCookie(REFRESH_COOKIE, { ...cookieOptions(req), maxAge: undefined });
}

module.exports = { signAccessToken, startSession, issueRefreshToken, consumeRefreshToken, endSession, REFRESH_COOKIE };
