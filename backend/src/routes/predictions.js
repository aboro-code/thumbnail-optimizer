const fs = require("fs");
const path = require("path");

const express = require("express");
const mongoose = require("mongoose");

const { requireAuth } = require("../middleware/auth");
const { MIME_BY_EXTENSION } = require("../middleware/upload");
const { UPLOAD_DIR } = require("../config/uploadDir");
const Thumbnail = require("../models/Thumbnail");
const Prediction = require("../models/Prediction");

const router = express.Router();

const PRIVILEGED_ROLES = ["Manager", "Admin"];

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

  const isPrivileged = PRIVILEGED_ROLES.includes(req.user.role);
  const unauthorized = thumbnails.some((t) => !isPrivileged && t.user_id.toString() !== req.user.sub);
  if (unauthorized) {
    return res.status(403).json({ message: "Insufficient permissions" });
  }

  let scored;
  try {
    scored = await Promise.all(
      thumbnails.map(async (thumbnail) => {
        const { ctr_score, explanation_signals } = await scoreOneThumbnail(thumbnail);
        return { thumbnail, ctr_score, explanation_signals };
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
    scored.map(async ({ thumbnail, ctr_score, rank, explanation_signals }) => {
      await Prediction.create({
        thumbnail_id: thumbnail._id,
        ctr_score,
        rank,
        explanation_signals,
      });
      thumbnail.status = "SCORED";
      await thumbnail.save();

      return {
        thumbnail_id: thumbnail._id,
        ctr_score,
        rank,
        explanation_signals,
      };
    })
  );

  res.json({ results });
});

module.exports = router;
