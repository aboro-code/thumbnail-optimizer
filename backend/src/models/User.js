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
  // Only Admins can deactivate an account (D-38). Checked on every request (D-42).
  status: { type: String, enum: ["active", "deactivated"], default: "active" },
  // Simple audit of the last role change.
  role_changed_at: { type: Date, default: null },
  role_changed_by: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  created_at: { type: Date, default: Date.now },
});

userSchema.index({ manager_id: 1 });

module.exports = mongoose.model("User", userSchema);
