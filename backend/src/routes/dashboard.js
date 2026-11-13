const express = require("express");

const { requireAuth } = require("../middleware/auth");
const Thumbnail = require("../models/Thumbnail");
const ABTest = require("../models/ABTest");
const ReportExport = require("../models/ReportExport");
const { latestScoresByThumbnail } = require("../services/predictionLookup");
const { predictedWinnerIndex, predictionMatchedWinner } = require("../services/abtestReport");

const router = express.Router();

const PRIVILEGED_ROLES = ["Manager", "Admin"];
const SCORE_BINS = 10; // 0-10, 10-20, ... 90-100

function round1(value) {
  return Math.round(value * 10) / 10;
}

// GET /api/v1/dashboard/summary
// The PRD §3.1 dashboard metrics, computed server-side so the page needs one request.
// Scoped like every other list: Creators see their own data, Managers/Admins see all.
router.get("/summary", requireAuth, async (req, res) => {
  const privileged = PRIVILEGED_ROLES.includes(req.user.role);

  const [thumbnails, tests, reportsGenerated] = await Promise.all([
    Thumbnail.find(privileged ? {} : { user_id: req.user.sub }).select("_id"),
    ABTest.find(privileged ? {} : { created_by: req.user.sub }),
    ReportExport.countDocuments(privileged ? {} : { user_id: req.user.sub }),
  ]);

  const ids = [...thumbnails.map((t) => t._id), ...tests.flatMap((t) => t.variants.map((v) => v.thumbnail_id))];
  const scores = await latestScoresByThumbnail(ids);

  // Score distribution of the user's own thumbnails (latest score each).
  const distribution = Array.from({ length: SCORE_BINS }, (_, i) => ({ from: i * 10, to: i * 10 + 10, count: 0 }));
  let scored = 0;
  for (const t of thumbnails) {
    const score = scores.get(t._id.toString());
    if (score === undefined) continue;
    scored += 1;
    distribution[Math.min(SCORE_BINS - 1, Math.floor(score / 10))].count += 1;
  }

  // Per test: how far the AI's top pick is predicted to beat the other variants,
  // and (once completed) whether that pick actually won.
  const lifts = [];
  let correct = 0;
  let checked = 0;
  for (const test of tests) {
    const predictions = test.variants.map((v) => {
      const score = scores.get(v.thumbnail_id.toString());
      return score === undefined ? null : { ctr_score: score };
    });
    const topIdx = predictedWinnerIndex(predictions);
    if (topIdx === null || predictions.length < 2) continue;

    const others = predictions.filter((_, idx) => idx !== topIdx);
    const othersMean = others.reduce((sum, p) => sum + p.ctr_score, 0) / others.length;
    lifts.push(predictions[topIdx].ctr_score - othersMean);

    if (test.status === "COMPLETED") {
      const matched = predictionMatchedWinner(test.variants, predictions, test.winner_variant_id);
      if (matched !== null) {
        checked += 1;
        if (matched) correct += 1;
      }
    }
  }

  res.json({
    thumbnails_total: thumbnails.length,
    thumbnails_scored: scored,
    active_tests: tests.filter((t) => t.status === "RUNNING").length,
    completed_tests: tests.filter((t) => t.status === "COMPLETED").length,
    avg_predicted_lift: lifts.length ? round1(lifts.reduce((a, b) => a + b, 0) / lifts.length) : null,
    prediction_accuracy: { correct, total: checked },
    reports_generated: reportsGenerated,
    score_distribution: distribution,
  });
});

module.exports = router;
