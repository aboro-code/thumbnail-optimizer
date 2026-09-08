const express = require("express");
const { requireAuth, requireRole } = require("../middleware/auth");

const router = express.Router();

// POST /api/v1/abtests
router.post("/", requireAuth, requireRole("Creator", "Manager", "Admin"), (req, res) => {
  res.status(501).json({ message: "Not implemented yet" });
});

// PATCH /api/v1/abtests/:id/status
router.patch("/:id/status", requireAuth, requireRole("Manager", "Admin"), (req, res) => {
  res.status(501).json({ message: "Not implemented yet" });
});

module.exports = router;
