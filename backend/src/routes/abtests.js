const express = require("express");
const mongoose = require("mongoose");

const { requireAuth, requireRole } = require("../middleware/auth");
const Thumbnail = require("../models/Thumbnail");
const Prediction = require("../models/Prediction");
const ABTest = require("../models/ABTest");

const router = express.Router();

const PRIVILEGED_ROLES = ["Manager", "Admin"];
const MIN_VARIANTS = 2;
const STATUSES = ["RUNNING", "COMPLETED", "CANCELLED"];

function isOwnerOrPrivileged(req, ownerId) {
  return PRIVILEGED_ROLES.includes(req.user.role) || ownerId.toString() === req.user.sub;
}

// POST /api/v1/abtests
router.post("/", requireAuth, requireRole("Creator", "Manager", "Admin"), async (req, res) => {
  const { content_reference, variant_thumbnail_ids, start_date, end_date } = req.body || {};

  if (!content_reference || typeof content_reference !== "string") {
    return res.status(400).json({ message: "content_reference is required" });
  }
  if (!Array.isArray(variant_thumbnail_ids) || variant_thumbnail_ids.length < MIN_VARIANTS) {
    return res
      .status(400)
      .json({ message: `variant_thumbnail_ids must include at least ${MIN_VARIANTS} thumbnails` });
  }
  if (!variant_thumbnail_ids.every((id) => mongoose.isValidObjectId(id))) {
    return res.status(400).json({ message: "variant_thumbnail_ids contains an invalid id" });
  }

  const start = new Date(start_date);
  const end = new Date(end_date);
  if (isNaN(start.getTime()) || isNaN(end.getTime()) || end <= start) {
    return res.status(400).json({ message: "start_date and end_date must be valid, with end_date after start_date" });
  }

  const thumbnails = await Thumbnail.find({ _id: { $in: variant_thumbnail_ids } });
  if (thumbnails.length !== variant_thumbnail_ids.length) {
    return res.status(404).json({ message: "One or more thumbnails were not found" });
  }

  const isPrivileged = PRIVILEGED_ROLES.includes(req.user.role);
  const unauthorized = thumbnails.some((t) => !isPrivileged && t.user_id.toString() !== req.user.sub);
  if (unauthorized) {
    return res.status(403).json({ message: "Insufficient permissions" });
  }

  const abTest = await ABTest.create({
    created_by: req.user.sub,
    content_reference,
    start_date: start,
    end_date: end,
    status: "RUNNING",
    variants: variant_thumbnail_ids.map((thumbnail_id) => ({ thumbnail_id })),
  });

  await Thumbnail.updateMany(
    { _id: { $in: variant_thumbnail_ids } },
    { $set: { status: "TESTING" } }
  );

  res.status(201).json({
    ab_test_id: abTest._id,
    status: abTest.status,
    variants: abTest.variants.length,
  });
});

// GET /api/v1/abtests
// Not part of the documented §7 API contract, but needed for the /abtests
// list page (§3.1) - mirrors the scoping pattern used by GET /thumbnails.
router.get("/", requireAuth, async (req, res) => {
  const { status } = req.query;
  if (status && !STATUSES.includes(status)) {
    return res.status(400).json({ message: `status must be one of ${STATUSES.join(", ")}` });
  }

  const filter = PRIVILEGED_ROLES.includes(req.user.role) ? {} : { created_by: req.user.sub };
  if (status) filter.status = status;

  const tests = await ABTest.find(filter).sort({ createdAt: -1 });

  res.json({
    ab_tests: tests.map((t) => ({
      _id: t._id,
      content_reference: t.content_reference,
      status: t.status,
      start_date: t.start_date,
      end_date: t.end_date,
      variant_count: t.variants.length,
      winner_variant_id: t.winner_variant_id,
      created_at: t.createdAt,
    })),
  });
});

// GET /api/v1/abtests/:id
// Also not in §7 - needed for the /abtests/:id detail page (§3.1). Populates
// each variant's thumbnail so the detail view doesn't need N extra requests.
router.get("/:id", requireAuth, async (req, res) => {
  let test;
  try {
    test = await ABTest.findById(req.params.id).populate({
      path: "variants.thumbnail_id",
      select: "image_url content_title status",
    });
  } catch (err) {
    return res.status(400).json({ message: "Invalid ab test id" });
  }
  if (!test) {
    return res.status(404).json({ message: "A/B test not found" });
  }
  if (!isOwnerOrPrivileged(req, test.created_by)) {
    return res.status(403).json({ message: "Insufficient permissions" });
  }

  res.json(test);
});

// PATCH /api/v1/abtests/:id/variants/:variantId/metrics
// Not part of the documented §7 API contract, but needed to support
// recording engagement data per variant (§8.1 ABTestRepository.updateVariantMetrics,
// §1.13 "entered by the user ... manually").
router.patch(
  "/:id/variants/:variantId/metrics",
  requireAuth,
  requireRole("Creator", "Manager", "Admin"),
  async (req, res) => {
    const { impressions, clicks } = req.body || {};

    if (impressions === undefined && clicks === undefined) {
      return res.status(400).json({ message: "Provide impressions and/or clicks to update" });
    }
    if (impressions !== undefined && (typeof impressions !== "number" || impressions < 0)) {
      return res.status(400).json({ message: "impressions must be a non-negative number" });
    }
    if (clicks !== undefined && (typeof clicks !== "number" || clicks < 0)) {
      return res.status(400).json({ message: "clicks must be a non-negative number" });
    }

    let abTest;
    try {
      abTest = await ABTest.findById(req.params.id);
    } catch (err) {
      return res.status(400).json({ message: "Invalid ab test id" });
    }
    if (!abTest) {
      return res.status(404).json({ message: "A/B test not found" });
    }
    if (!isOwnerOrPrivileged(req, abTest.created_by)) {
      return res.status(403).json({ message: "Insufficient permissions" });
    }

    const variant = abTest.variants.id(req.params.variantId);
    if (!variant) {
      return res.status(404).json({ message: "Variant not found on this A/B test" });
    }

    if (impressions !== undefined) variant.impressions = impressions;
    if (clicks !== undefined) variant.clicks = clicks;
    if (variant.clicks > variant.impressions) {
      return res.status(400).json({ message: "clicks cannot exceed impressions" });
    }
    variant.measured_ctr = variant.impressions > 0 ? variant.clicks / variant.impressions : 0;

    await abTest.save();

    res.json({
      ab_test_id: abTest._id,
      variant_id: variant._id,
      impressions: variant.impressions,
      clicks: variant.clicks,
      measured_ctr: variant.measured_ctr,
    });
  }
);

// PATCH /api/v1/abtests/:id/status
router.patch("/:id/status", requireAuth, requireRole("Manager", "Admin"), async (req, res) => {
  const { status } = req.body || {};
  if (!["COMPLETED", "CANCELLED"].includes(status)) {
    return res.status(400).json({ message: "status must be COMPLETED or CANCELLED" });
  }

  let current;
  try {
    current = await ABTest.findById(req.params.id);
  } catch (err) {
    return res.status(400).json({ message: "Invalid ab test id" });
  }
  if (!current) {
    return res.status(404).json({ message: "A/B test not found" });
  }

  // Guard the transition on the test still being RUNNING, so two concurrent
  // close requests can't both "win" and double-write a winner (PRD §15.3).
  const updateFields = { status };
  let winnerVariant = null;
  let predictionMatchedWinner = null;

  if (status === "COMPLETED") {
    winnerVariant = current.variants.reduce((best, v) => {
      if (!best || v.measured_ctr > best.measured_ctr) return v;
      return best;
    }, null);

    if (winnerVariant) {
      updateFields.winner_variant_id = winnerVariant._id;

      const predictions = await Promise.all(
        current.variants.map((v) =>
          Prediction.findOne({ thumbnail_id: v.thumbnail_id }).sort({ scored_at: -1 })
        )
      );

      if (predictions.every((p) => p !== null)) {
        const predictedWinnerIndex = predictions.reduce(
          (bestIdx, p, idx) => (p.ctr_score > predictions[bestIdx].ctr_score ? idx : bestIdx),
          0
        );
        const predictedWinnerThumbnailId = current.variants[predictedWinnerIndex].thumbnail_id.toString();
        predictionMatchedWinner = predictedWinnerThumbnailId === winnerVariant.thumbnail_id.toString();
      }
    }
  }

  const updated = await ABTest.findOneAndUpdate(
    { _id: current._id, status: "RUNNING" },
    { $set: updateFields },
    { new: true }
  );

  if (!updated) {
    return res.status(409).json({ message: "This test has already been closed" });
  }

  await Thumbnail.updateMany(
    { _id: { $in: updated.variants.map((v) => v.thumbnail_id) } },
    { $set: { status: "COMPLETED" } }
  );

  res.json({
    ab_test_id: updated._id,
    status: updated.status,
    winner_variant_id: updated.winner_variant_id,
    prediction_matched_winner: predictionMatchedWinner,
    updated_at: updated.updatedAt,
  });
});

module.exports = router;
