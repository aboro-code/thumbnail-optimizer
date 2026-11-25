const mongoose = require("mongoose");

// One row per signed-in browser (PRD §10.1). Only a SHA-256 hash of the token
// is stored, so a database leak can't be used to sign in.
const refreshTokenSchema = new mongoose.Schema({
  user_id: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  token_hash: { type: String, required: true, unique: true },
  expires_at: { type: Date, required: true },
  created_at: { type: Date, default: Date.now },
});

// MongoDB removes expired rows by itself.
refreshTokenSchema.index({ expires_at: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model("RefreshToken", refreshTokenSchema);
