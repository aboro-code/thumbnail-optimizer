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
  created_at: { type: Date, default: Date.now },
});

module.exports = mongoose.model("User", userSchema);
