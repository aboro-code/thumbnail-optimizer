const express = require("express");

const { requireAuth } = require("../middleware/auth");
const ABTest = require("../models/ABTest");
const { buildReport } = require("../services/abtestReport");
const { toCsv, toPdf } = require("../services/reportExport");

const router = express.Router();

const PRIVILEGED_ROLES = ["Manager", "Admin"];
const FORMATS = ["csv", "pdf"];

// GET /api/v1/reports/:abTestId/export?format=csv|pdf  (PRD §7.5, US-05)
router.get("/:abTestId/export", requireAuth, async (req, res) => {
  const format = (req.query.format || "pdf").toLowerCase();
  if (!FORMATS.includes(format)) {
    return res.status(400).json({ message: "format must be csv or pdf" });
  }

  let test;
  try {
    test = await ABTest.findById(req.params.abTestId);
  } catch (err) {
    return res.status(400).json({ message: "Invalid ab test id" });
  }
  if (!test) {
    return res.status(404).json({ message: "A/B test not found" });
  }
  if (!PRIVILEGED_ROLES.includes(req.user.role) && test.created_by.toString() !== req.user.sub) {
    return res.status(403).json({ message: "Insufficient permissions" });
  }

  const report = await buildReport(test);
  const filename = `abtest-${report.ab_test_id}.${format}`;
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);

  if (format === "csv") {
    res.type("text/csv; charset=utf-8");
    // Byte-order mark so Excel opens the file as UTF-8
    return res.send(String.fromCharCode(0xfeff) + toCsv(report));
  }

  res.type("application/pdf");
  res.send(await toPdf(report));
});

module.exports = router;
