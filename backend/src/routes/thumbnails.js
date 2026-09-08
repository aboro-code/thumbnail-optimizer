const express = require("express");
const { requireAuth, requireRole } = require("../middleware/auth");

const router = express.Router();

// POST /api/v1/thumbnails/upload
router.post("/upload", requireAuth, requireRole("Creator", "Manager", "Admin"), (req, res) => {
  res.status(501).json({ message: "Not implemented yet" });
});

module.exports = router;
