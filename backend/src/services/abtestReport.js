const fs = require("fs/promises");
const path = require("path");

const Prediction = require("../models/Prediction");
const Thumbnail = require("../models/Thumbnail");
const { UPLOAD_DIR } = require("../config/uploadDir");

// Latest prediction per variant, in variant order (null where a variant was never scored).
function latestPredictions(variants) {
  return Promise.all(
    variants.map((v) => Prediction.findOne({ thumbnail_id: v.thumbnail_id }).sort({ scored_at: -1 }))
  );
}

// Index of the variant the AI ranked highest, or null if any variant is unscored.
function predictedWinnerIndex(predictions) {
  if (predictions.length === 0 || predictions.some((p) => p === null)) return null;
  return predictions.reduce(
    (bestIdx, p, idx) => (p.ctr_score > predictions[bestIdx].ctr_score ? idx : bestIdx),
    0
  );
}

// true/false once there is a winner and every variant was scored; otherwise null ("unknown").
function predictionMatchedWinner(variants, predictions, winnerVariantId) {
  const predictedIdx = predictedWinnerIndex(predictions);
  if (predictedIdx === null || !winnerVariantId) return null;
  return variants[predictedIdx]._id.toString() === winnerVariantId.toString();
}

// Everything an export needs about one A/B test, as plain data.
async function buildReport(test) {
  const predictions = await latestPredictions(test.variants);
  const thumbnails = await Thumbnail.find({ _id: { $in: test.variants.map((v) => v.thumbnail_id) } });
  const thumbnailById = new Map(thumbnails.map((t) => [t._id.toString(), t]));

  const predictedIdx = predictedWinnerIndex(predictions);
  const winnerId = test.winner_variant_id ? test.winner_variant_id.toString() : null;

  // Rank among this test's variants by predicted score (1 = AI's top pick).
  const ranks = new Map(
    predictions
      .map((p, idx) => ({ idx, score: p ? p.ctr_score : null }))
      .filter((r) => r.score !== null)
      .sort((a, b) => b.score - a.score)
      .map((r, position) => [r.idx, position + 1])
  );

  const variants = test.variants.map((v, idx) => {
    const thumbnail = thumbnailById.get(v.thumbnail_id.toString());
    const prediction = predictions[idx];
    return {
      variant_id: v._id.toString(),
      label: `Variant ${String.fromCharCode(65 + idx)}`,
      thumbnail_title: thumbnail?.content_title || "",
      image_url: thumbnail?.image_url || "",
      predicted_ctr_score: prediction ? prediction.ctr_score : null,
      predicted_rank: ranks.get(idx) ?? null,
      explanation_signals: prediction ? prediction.explanation_signals : [],
      explanation_text: prediction?.explanation_text || "",
      impressions: v.impressions,
      clicks: v.clicks,
      measured_ctr: v.measured_ctr,
      is_winner: winnerId === v._id.toString(),
      is_predicted_winner: predictedIdx === idx,
    };
  });

  return {
    ab_test_id: test._id.toString(),
    content_reference: test.content_reference,
    status: test.status,
    start_date: test.start_date,
    end_date: test.end_date,
    winner_variant_id: winnerId,
    prediction_matched_winner: predictionMatchedWinner(test.variants, predictions, winnerId),
    generated_at: new Date(),
    variants,
  };
}

// Reads an uploaded image from disk. basename() keeps a stored URL from escaping UPLOAD_DIR.
async function readUploadedImage(imageUrl) {
  if (!imageUrl) return null;
  try {
    return await fs.readFile(path.join(UPLOAD_DIR, path.basename(imageUrl)));
  } catch (err) {
    return null;
  }
}

module.exports = {
  latestPredictions,
  predictedWinnerIndex,
  predictionMatchedWinner,
  buildReport,
  readUploadedImage,
};
