const express = require("express");
const router = express.Router();

// POST /api/v1/abtests
router.post("/", (req, res) => {
  res.status(501).json({ message: "Not implemented yet" });
});

// PATCH /api/v1/abtests/:id/status
router.patch("/:id/status", (req, res) => {
  res.status(501).json({ message: "Not implemented yet" });
});

module.exports = router;
