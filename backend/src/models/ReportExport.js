const mongoose = require("mongoose");

// One row per downloaded report, for the /reports history and the dashboard count.
// The file itself isn't stored: it's regenerated on demand from the live test data.
const reportExportSchema = new mongoose.Schema({
  user_id: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  ab_test_id: { type: mongoose.Schema.Types.ObjectId, ref: "ABTest", required: true },
  format: { type: String, enum: ["csv", "pdf"], required: true },
  created_at: { type: Date, default: Date.now },
});

reportExportSchema.index({ user_id: 1, created_at: -1 });

module.exports = mongoose.model("ReportExport", reportExportSchema);
