const Prediction = require("../models/Prediction");

// Newest ctr_score per thumbnail in ONE query (instead of a findOne per thumbnail),
// returned as Map<thumbnailId string, score>. Thumbnails never scored are absent.
async function latestScoresByThumbnail(thumbnailIds) {
  if (thumbnailIds.length === 0) return new Map();
  const rows = await Prediction.aggregate([
    { $match: { thumbnail_id: { $in: thumbnailIds } } },
    { $sort: { scored_at: -1 } },
    { $group: { _id: "$thumbnail_id", ctr_score: { $first: "$ctr_score" } } },
  ]);
  return new Map(rows.map((r) => [r._id.toString(), r.ctr_score]));
}

module.exports = { latestScoresByThumbnail };
