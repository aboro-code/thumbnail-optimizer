const fs = require("fs");
const path = require("path");

const express = require("express");
const mongoose = require("mongoose");

const { requireAuth } = require("../middleware/auth");
const { MIME_BY_EXTENSION } = require("../middleware/upload");
const { UPLOAD_DIR } = require("../config/uploadDir");
const Thumbnail = require("../models/Thumbnail");
const Prediction = require("../models/Prediction");

const { canAccessAllOwners, canAccessOwner } = require("../services/access");

const router = express.Router();


async function scoreOneThumbnail(thumbnail) {
  const aiServiceUrl = process.env.AI_SERVICE_URL || "http://localhost:8000";

  const filename = path.basename(thumbnail.image_url);
  const filePath = path.join(UPLOAD_DIR, filename);
  const buffer = await fs.promises.readFile(filePath);

  const mimeType = MIME_BY_EXTENSION[path.extname(filename)] || "application/octet-stream";
  const form = new FormData();
  form.append("file", new Blob([buffer], { type: mimeType }), filename);
  if (thumbnail.content_title) {
    form.append("content_title", thumbnail.content_title);
  }
  // Score only (fast); the LLM sentence comes from POST /predictions/explain (D-47).
  form.append("explain", "false");

  const response = await fetch(`${aiServiceUrl}/api/v1/score`, {
    method: "POST",
    body: form,
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.detail || `AI service returned ${response.status}`);
  }

  return response.json();
}

// POST /api/v1/predictions/analyze
router.post("/analyze", requireAuth, async (req, res) => {
  const { thumbnail_ids } = req.body || {};

  if (!Array.isArray(thumbnail_ids) || thumbnail_ids.length === 0) {
    return res.status(400).json({ message: "thumbnail_ids must be a non-empty array" });
  }
  if (!thumbnail_ids.every((id) => mongoose.isValidObjectId(id))) {
    return res.status(400).json({ message: "thumbnail_ids contains an invalid id" });
  }

  const thumbnails = await Thumbnail.find({ _id: { $in: thumbnail_ids } });

  if (thumbnails.length !== thumbnail_ids.length) {
    return res.status(404).json({ message: "One or more thumbnails were not found" });
  }

  if (!(await canAccessAllOwners(req.user, thumbnails.map((t) => t.user_id)))) {
    return res.status(403).json({ message: "Insufficient permissions" });
  }

  let scored;
  try {
    scored = await Promise.all(
      thumbnails.map(async (thumbnail) => {
        const { ctr_score, explanation_signals, explanation_text } = await scoreOneThumbnail(thumbnail);
        return { thumbnail, ctr_score, explanation_signals, explanation_text };
      })
    );
  } catch (err) {
    return res.status(502).json({ message: "AI scoring service is unavailable" });
  }

  scored.sort((a, b) => b.ctr_score - a.ctr_score);
  scored.forEach((entry, index) => {
    entry.rank = index + 1;
  });

  const results = await Promise.all(
    scored.map(async ({ thumbnail, ctr_score, rank, explanation_signals, explanation_text }) => {
      await Prediction.create({
        thumbnail_id: thumbnail._id,
        ctr_score,
        rank,
        explanation_signals,
        explanation_text: explanation_text || null,
      });
      thumbnail.status = "SCORED";
      await thumbnail.save();

      return {
        thumbnail_id: thumbnail._id,
        ctr_score,
        rank,
        explanation_signals,
        explanation_text: explanation_text || null,
      };
    })
  );

  res.json({ results });
});

// POST /api/v1/predictions/explain  { thumbnail_id }
// Writes (once) the plain-language explanation for a thumbnail's latest score.
// Split from /analyze so scores show up in well under BR-001's 5 seconds while
// the local LLM, which takes several seconds per image on a CPU, catches up.
router.post("/explain", requireAuth, async (req, res) => {
  const { thumbnail_id: thumbnailId } = req.body || {};
  if (!mongoose.isValidObjectId(thumbnailId)) {
    return res.status(400).json({ message: "thumbnail_id is required" });
  }
  const thumbnail = await Thumbnail.findById(thumbnailId);
  if (!thumbnail) return res.status(404).json({ message: "Thumbnail not found" });
  if (!(await canAccessOwner(req.user, thumbnail.user_id))) {
    return res.status(403).json({ message: "Insufficient permissions" });
  }

  const prediction = await Prediction.findOne({ thumbnail_id: thumbnail._id }).sort({ scored_at: -1 });
  if (!prediction) return res.status(409).json({ message: "Score this thumbnail first" });
  if (prediction.explanation_text) {
    return res.json({ thumbnail_id: thumbnail._id, explanation_text: prediction.explanation_text });
  }

  const aiServiceUrl = process.env.AI_SERVICE_URL || "http://localhost:8000";
  try {
    const response = await fetch(`${aiServiceUrl}/api/v1/explain`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ctr_score: prediction.ctr_score,
        explanation_signals: prediction.explanation_signals,
      }),
    });
    if (!response.ok) throw new Error(`AI service returned ${response.status}`);
    const { explanation_text: text } = await response.json();
    prediction.explanation_text = text;
    await prediction.save();
    res.json({ thumbnail_id: thumbnail._id, explanation_text: text });
  } catch (err) {
    res.status(502).json({ message: "The explanation service is unavailable" });
  }
});

module.exports = router;
