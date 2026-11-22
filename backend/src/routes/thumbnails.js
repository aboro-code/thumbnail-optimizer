const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const express = require("express");
const multer = require("multer");

const { requireAuth, requireRole } = require("../middleware/auth");
const { upload, ALLOWED_MIME_TYPES, EXTENSION_BY_MIME } = require("../middleware/upload");
const { detectImageMime } = require("../utils/imageSignature");
const { UPLOAD_DIR } = require("../config/uploadDir");
const Thumbnail = require("../models/Thumbnail");
const { latestScoresByThumbnail } = require("../services/predictionLookup");
const { latestPredictions } = require("../services/abtestReport");

const { ownerFilter, canAccessOwner } = require("../services/access");

const router = express.Router();

const MIN_FILES_PER_BATCH = 2;
const THUMBNAIL_STATUSES = ["UPLOADED", "SCORED", "TESTING", "COMPLETED"];

function handleMulterErrors(err, req, res, next) {
  if (err instanceof multer.MulterError) {
    if (err.code === "LIMIT_FILE_SIZE") {
      return res.status(400).json({ message: "Each file must be 10MB or smaller" });
    }
    if (err.code === "LIMIT_FILE_COUNT") {
      return res.status(400).json({ message: "A batch may contain at most 10 files" });
    }
    if (err.code === "LIMIT_UNEXPECTED_FILE") {
      return res
        .status(400)
        .json({ message: "Only image/jpeg, image/png, and image/webp files are accepted" });
    }
    return res.status(400).json({ message: "Upload failed" });
  }
  next(err);
}

// POST /api/v1/thumbnails/upload
router.post(
  "/upload",
  requireAuth,
  requireRole("Creator", "Manager", "Admin"),
  upload.array("files"),
  handleMulterErrors,
  async (req, res) => {
    const files = req.files || [];

    if (files.length < MIN_FILES_PER_BATCH) {
      return res
        .status(400)
        .json({ message: `At least ${MIN_FILES_PER_BATCH} images are required per batch` });
    }

    for (const file of files) {
      const actualMime = detectImageMime(file.buffer);
      if (!actualMime || !ALLOWED_MIME_TYPES.includes(actualMime)) {
        return res
          .status(400)
          .json({ message: `${file.originalname} is not a valid image file` });
      }
    }

    const { content_title, target_platform } = req.body || {};
    const batchId = crypto.randomUUID();

    try {
      const thumbnails = await Promise.all(
        files.map(async (file) => {
          const actualMime = detectImageMime(file.buffer);
          const filename = `${crypto.randomUUID()}${EXTENSION_BY_MIME[actualMime]}`;
          await fs.promises.writeFile(path.join(UPLOAD_DIR, filename), file.buffer);

          return Thumbnail.create({
            user_id: req.user.sub,
            image_url: `/uploads/${filename}`,
            content_title,
            target_platform,
            status: "UPLOADED",
            batch_id: batchId,
          });
        })
      );

      // Scoring is not queued here: the caller scores the batch with
      // POST /predictions/analyze, so the thumbnails are simply UPLOADED.
      res.status(201).json({
        thumbnail_ids: thumbnails.map((t) => t._id),
        batch_id: batchId,
        status: "UPLOADED",
        message: "Thumbnails uploaded. Score them with POST /api/v1/predictions/analyze.",
      });
    } catch (err) {
      res.status(500).json({ message: "Failed to store uploaded thumbnails" });
    }
  }
);

// GET /api/v1/thumbnails
router.get("/", requireAuth, async (req, res) => {
  const { status } = req.query;

  if (status && !THUMBNAIL_STATUSES.includes(status)) {
    return res.status(400).json({ message: `status must be one of ${THUMBNAIL_STATUSES.join(", ")}` });
  }

  const filter = await ownerFilter(req.user);
  if (status) filter.status = status;

  try {
    const thumbnails = await Thumbnail.find(filter).sort({ uploaded_at: -1 });
    const scores = await latestScoresByThumbnail(thumbnails.map((t) => t._id));
    res.json({
      thumbnails: thumbnails.map((t) => ({
        ...t.toObject(),
        latest_ctr_score: scores.get(t._id.toString()) ?? null,
      })),
    });
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch thumbnails" });
  }
});

// Thumbnails uploaded before batch ids existed: treat the owner's uploads
// within a few seconds of this one as its batch.
const LEGACY_BATCH_WINDOW_MS = 10 * 1000;

// GET /api/v1/thumbnails/:id/batch
// The whole batch this thumbnail was uploaded with, each with its latest
// prediction and a rank within the batch, so /thumbnails/:id/optimize can
// reopen any earlier upload (not only the last one).
router.get("/:id/batch", requireAuth, async (req, res) => {
  let thumbnail;
  try {
    thumbnail = await Thumbnail.findById(req.params.id);
  } catch (err) {
    return res.status(400).json({ message: "Invalid thumbnail id" });
  }
  if (!thumbnail) {
    return res.status(404).json({ message: "Thumbnail not found" });
  }
  if (!(await canAccessOwner(req.user, thumbnail.user_id))) {
    return res.status(403).json({ message: "Insufficient permissions" });
  }

  const at = thumbnail.uploaded_at.getTime();
  const filter = thumbnail.batch_id
    ? { batch_id: thumbnail.batch_id }
    : {
        user_id: thumbnail.user_id,
        batch_id: { $exists: false },
        uploaded_at: { $gte: new Date(at - LEGACY_BATCH_WINDOW_MS), $lte: new Date(at + LEGACY_BATCH_WINDOW_MS) },
      };
  const batch = await Thumbnail.find(filter).sort({ uploaded_at: 1 });

  const predictions = await latestPredictions(batch.map((t) => ({ thumbnail_id: t._id })));
  const items = batch.map((t, i) => {
    const p = predictions[i];
    return {
      _id: t._id,
      image_url: t.image_url,
      content_title: t.content_title,
      target_platform: t.target_platform,
      status: t.status,
      uploaded_at: t.uploaded_at,
      ctr_score: p ? p.ctr_score : null,
      explanation_signals: p ? p.explanation_signals : [],
      explanation_text: p ? p.explanation_text : null,
    };
  });
  // Rank within this batch by latest score; unscored items get no rank.
  const ranked = items.filter((i) => i.ctr_score !== null).sort((a, b) => b.ctr_score - a.ctr_score);
  ranked.forEach((item, idx) => {
    item.rank = idx + 1;
  });

  res.json({
    batch_id: thumbnail.batch_id || null,
    content_title: thumbnail.content_title || null,
    all_scored: items.every((i) => i.ctr_score !== null),
    items: [...ranked, ...items.filter((i) => i.ctr_score === null)],
  });
});

// GET /api/v1/thumbnails/:id
router.get("/:id", requireAuth, async (req, res) => {
  try {
    const thumbnail = await Thumbnail.findById(req.params.id);
    if (!thumbnail) {
      return res.status(404).json({ message: "Thumbnail not found" });
    }

    if (!(await canAccessOwner(req.user, thumbnail.user_id))) {
      return res.status(403).json({ message: "Insufficient permissions" });
    }

    res.json(thumbnail);
  } catch (err) {
    if (err.name === "CastError") {
      return res.status(400).json({ message: "Invalid thumbnail id" });
    }
    res.status(500).json({ message: "Failed to fetch thumbnail" });
  }
});

module.exports = router;
