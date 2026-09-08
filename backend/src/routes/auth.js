const express = require("express");
const router = express.Router();

// POST /api/v1/auth/signup
router.post("/signup", (req, res) => {
  res.status(501).json({ message: "Not implemented yet" });
});

// POST /api/v1/auth/login
router.post("/login", (req, res) => {
  res.status(501).json({ message: "Not implemented yet" });
});

module.exports = router;
