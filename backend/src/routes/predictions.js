const express = require("express");
const router = express.Router();

// POST /api/v1/predictions/analyze
router.post("/analyze", (req, res) => {
  res.status(501).json({ message: "Not implemented yet" });
});

module.exports = router;
