const mongoose = require("mongoose");

const variantSchema = new mongoose.Schema({
  thumbnail_id: { type: mongoose.Schema.Types.ObjectId, ref: "Thumbnail", required: true },
  impressions: { type: Number, default: 0 },
  clicks: { type: Number, default: 0 },
  measured_ctr: { type: Number, default: 0 },
});

const abTestSchema = new mongoose.Schema({
  // Who clicked "Create" (audit only, e.g. a Manager starting a test for a creator).
  created_by: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  // Whose test it is: the owner of all its thumbnails (D-44). Visibility,
  // closing, reports and the dashboard all use this field.
  owner_id: { type: mongoose.Schema.Types.ObjectId, ref: "User", index: true },
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
}, { timestamps: true });

abTestSchema.index({ status: 1 });

// Fallback for tests written without an owner (e.g. created directly in code):
// the creator owns it. Existing documents are backfilled from their thumbnails
// by config/migrations.js.
abTestSchema.pre("validate", function setDefaultOwner(next) {
  if (!this.owner_id) this.owner_id = this.created_by;
  next();
});

module.exports = mongoose.model("ABTest", abTestSchema);
