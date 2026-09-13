const mongoose = require("mongoose");

const predictionSchema = new mongoose.Schema({
  thumbnail_id: { type: mongoose.Schema.Types.ObjectId, ref: "Thumbnail", required: true },
  ctr_score: { type: Number, required: true, min: 0, max: 100 },
  rank: { type: Number },
  explanation_signals: { type: [String], default: [] },
  scored_at: { type: Date, default: Date.now },
});

predictionSchema.index({ thumbnail_id: 1 });

module.exports = mongoose.model("Prediction", predictionSchema);
