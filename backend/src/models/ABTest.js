const mongoose = require("mongoose");

const variantSchema = new mongoose.Schema({
  thumbnail_id: { type: mongoose.Schema.Types.ObjectId, ref: "Thumbnail", required: true },
  impressions: { type: Number, default: 0 },
  clicks: { type: Number, default: 0 },
  measured_ctr: { type: Number, default: 0 },
});

const abTestSchema = new mongoose.Schema({
  created_by: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  content_reference: { type: String, required: true },
  status: {
    type: String,
    enum: ["RUNNING", "COMPLETED", "CANCELLED"],
    default: "RUNNING",
  },
  start_date: { type: Date, required: true },
  end_date: { type: Date, required: true },
  variants: [variantSchema],
  winner_variant_id: { type: mongoose.Schema.Types.ObjectId, default: null },
});

abTestSchema.index({ status: 1 });

module.exports = mongoose.model("ABTest", abTestSchema);
