const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const express = require("express");
const multer = require("multer");

const { requireAuth, requireRole } = require("../middleware/auth");
const { upload, ALLOWED_MIME_TYPES } = require("../middleware/upload");
const { detectImageMime } = require("../utils/imageSignature");
const Thumbnail = require("../models/Thumbnail");

const router = express.Router();

const MIN_FILES_PER_BATCH = 2;
const UPLOAD_DIR = process.env.UPLOAD_DIR
  ? path.resolve(process.env.UPLOAD_DIR)
  : path.join(__dirname, "..", "..", "uploads");
const EXTENSION_BY_MIME = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
};

fs.mkdirSync(UPLOAD_DIR, { recursive: true });

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
          });
        })
      );

      res.status(202).json({
        thumbnail_ids: thumbnails.map((t) => t._id),
        status: "PROCESSING",
        message: "Thumbnails uploaded successfully. Scoring job queued.",
      });
    } catch (err) {
      res.status(500).json({ message: "Failed to store uploaded thumbnails" });
    }
  }
);

module.exports = router;
