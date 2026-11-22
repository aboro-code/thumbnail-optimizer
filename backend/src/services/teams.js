const crypto = require("crypto");

const User = require("../models/User");

// No 0/O/1/I so codes are easy to read out loud or copy by hand.
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const CODE_LENGTH = 8;

function generateInviteCode() {
  const bytes = crypto.randomBytes(CODE_LENGTH);
  return Array.from(bytes, (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join("");
}

// Gives a Manager an invite code the first time one is needed.
async function ensureInviteCode(manager) {
  if (manager.invite_code) return manager.invite_code;
  manager.invite_code = generateInviteCode();
  await manager.save();
  return manager.invite_code;
}

async function findManagerByCode(code) {
  if (typeof code !== "string" || !code.trim()) return null;
  return User.findOne({ invite_code: code.trim().toUpperCase(), role: "Manager", active: { $ne: false } });
}

module.exports = { generateInviteCode, ensureInviteCode, findManagerByCode };
