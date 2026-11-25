const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");
const rateLimit = require("express-rate-limit");

const User = require("../models/User");

const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 60,
  skip: () => process.env.NODE_ENV === "test",
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.user?.sub || req.ip,
  message: { message: "Too many requests. Please slow down." },
});

const DEACTIVATED = {
  code: "ACCOUNT_DEACTIVATED",
  message: "Your account has been deactivated. Please contact your manager or an administrator to reactivate it.",
};
const DELETED = { code: "ACCOUNT_DELETED", message: "This account no longer exists." };

// Verifies the JWT, then loads the user's CURRENT role and status from the
// database on every request (D-42). Role changes, deactivation and deletion
// therefore take effect on the next request, not at the next sign-in.
async function requireAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;

  if (!token) {
    return res.status(401).json({ message: "Missing or invalid Authorization header" });
  }

  let claims;
  try {
    claims = jwt.verify(token, process.env.JWT_SECRET);
  } catch (err) {
    return res.status(401).json({ code: "TOKEN_INVALID", message: "Invalid or expired token" });
  }

  try {
    const user = mongoose.isValidObjectId(claims.sub)
      ? await User.findById(claims.sub).select("role status manager_id").lean()
      : null;
    if (!user) return res.status(401).json(DELETED);
    if (user.status === "deactivated") return res.status(403).json(DEACTIVATED);
    req.user = { sub: String(user._id), role: user.role, manager_id: user.manager_id || null };
  } catch (err) {
    return next(err);
  }

  apiLimiter(req, res, next);
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ message: "Insufficient permissions" });
    }
    next();
  };
}

module.exports = { requireAuth, requireRole, DEACTIVATED, DELETED };
