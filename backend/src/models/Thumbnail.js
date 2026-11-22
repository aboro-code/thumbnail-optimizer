const mongoose = require("mongoose");

const thumbnailSchema = new mongoose.Schema({
  user_id: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  image_url: { type: String, required: true },
  content_title: { type: String },
  target_platform: { type: String },
  status: {
    type: String,
    enum: ["UPLOADED", "SCORED", "TESTING", "COMPLETED"],
    default: "UPLOADED",
  },
  uploaded_at: { type: Date, default: Date.now },
  // Every thumbnail uploaded together shares a batch id, so a batch can be
  // reopened on the Optimize page later (/thumbnails/:id/optimize).
  batch_id: { type: String, index: true },
});

thumbnailSchema.index({ user_id: 1 });
thumbnailSchema.index({ user_id: 1, uploaded_at: -1 });

module.exports = mongoose.model("Thumbnail", thumbnailSchema);
