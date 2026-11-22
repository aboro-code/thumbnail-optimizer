const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  password_hash: {
    type: String,
    required: function () {
      return !this.google_id;
    },
  },
  google_id: { type: String, unique: true, sparse: true },
  name: { type: String, trim: true },
  role: { type: String, enum: ["Creator", "Manager", "Admin"], default: "Creator" },
  profile_complete: { type: Boolean, default: true },
  // Team link (D-37): a Creator belongs to at most one Manager. Set by an Admin
  // or by the Creator entering the Manager's invite code.
  manager_id: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  // Managers only: the code Creators enter to join their team.
  invite_code: { type: String, unique: true, sparse: true },
  // Admins can deactivate an account; it can no longer sign in.
  active: { type: Boolean, default: true },
  created_at: { type: Date, default: Date.now },
});

userSchema.index({ manager_id: 1 });

module.exports = mongoose.model("User", userSchema);
