const express = require("express");

const { requireAuth } = require("../middleware/auth");
const ABTest = require("../models/ABTest");
const ReportExport = require("../models/ReportExport");
const { buildReport } = require("../services/abtestReport");
const { toCsv, toPdf } = require("../services/reportExport");

const router = express.Router();

const PRIVILEGED_ROLES = ["Manager", "Admin"];
const FORMATS = ["csv", "pdf"];
const HISTORY_LIMIT = 100;

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
  // Byte-order mark so Excel opens the CSV as UTF-8
  const body = format === "csv" ? String.fromCharCode(0xfeff) + toCsv(report) : await toPdf(report);

  // Logged only once the file was actually generated.
  await ReportExport.create({ user_id: req.user.sub, ab_test_id: test._id, format });

  res.setHeader("Content-Disposition", `attachment; filename="abtest-${report.ab_test_id}.${format}"`);
  res.type(format === "csv" ? "text/csv; charset=utf-8" : "application/pdf");
  res.send(body);
});

// GET /api/v1/reports  (PRD §3.1 /reports: history of exported reports)
// Creators see their own exports; Managers/Admins see everyone's.
router.get("/", requireAuth, async (req, res) => {
  const filter = PRIVILEGED_ROLES.includes(req.user.role) ? {} : { user_id: req.user.sub };
  const exports = await ReportExport.find(filter)
    .sort({ created_at: -1 })
    .limit(HISTORY_LIMIT)
    .populate({ path: "ab_test_id", select: "content_reference status" })
    .populate({ path: "user_id", select: "email name" });

  res.json({
    reports: exports.map((e) => ({
      _id: e._id,
      format: e.format,
      created_at: e.created_at,
      // null if the test was deleted since; the row stays as history
      ab_test: e.ab_test_id
        ? { _id: e.ab_test_id._id, content_reference: e.ab_test_id.content_reference, status: e.ab_test_id.status }
        : null,
      exported_by: e.user_id ? e.user_id.name || e.user_id.email : null,
    })),
  });
});

module.exports = router;
