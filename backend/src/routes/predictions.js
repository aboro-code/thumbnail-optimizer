const express = require("express");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();

// POST /api/v1/predictions/analyze
router.post("/analyze", requireAuth, (req, res) => {
  res.status(501).json({ message: "Not implemented yet" });
});

module.exports = router;
