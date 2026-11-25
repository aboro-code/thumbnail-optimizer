const express = require("express");
const mongoose = require("mongoose");

const User = require("../models/User");
const Thumbnail = require("../models/Thumbnail");
const Prediction = require("../models/Prediction");
const ABTest = require("../models/ABTest");
const ReportExport = require("../models/ReportExport");
const { requireAuth, requireRole } = require("../middleware/auth");
const { latestPredictions, predictionMatchedWinner } = require("../services/abtestReport");
const { accountSummary, deleteAccount } = require("../services/accounts");

const router = express.Router();
const ROLES = ["Creator", "Manager", "Admin"];
const STATUSES = ["active", "deactivated"];
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

router.use(requireAuth, requireRole("Admin"));

function signInMethod(user) {
  if (!user.google_id) return "password";
  return user.password_hash ? "google+password" : "google";
}

// GET /api/v1/admin/users - every account, with its manager and upload count.
router.get("/users", async (req, res) => {
  const [users, uploads, teams] = await Promise.all([
    User.find().sort({ created_at: -1 }).lean(),
    Thumbnail.aggregate([{ $group: { _id: "$user_id", count: { $sum: 1 } } }]),
    User.aggregate([{ $match: { manager_id: { $ne: null } } }, { $group: { _id: "$manager_id", count: { $sum: 1 } } }]),
  ]);
  const uploadsByUser = new Map(uploads.map((u) => [String(u._id), u.count]));
  const teamSizes = new Map(teams.map((t) => [String(t._id), t.count]));
  const emailById = new Map(users.map((u) => [String(u._id), u.email]));

  res.json({
    users: users.map((u) => ({
      id: u._id,
      email: u.email,
      name: u.name || null,
      role: u.role,
      status: u.status || "active",
      sign_in: signInMethod(u),
      manager_id: u.manager_id || null,
      manager_email: u.manager_id ? emailById.get(String(u.manager_id)) || null : null,
      thumbnails: uploadsByUser.get(String(u._id)) || 0,
      team_size: teamSizes.get(String(u._id)) || 0,
      created_at: u.created_at,
    })),
  });
});

// PATCH /api/v1/admin/users/:id
//   { role?, manager_id?, status?, reassign_to?, release_team? }
// Takes effect on the user's next request: requireAuth reads role and status
// from the database (D-42).
// Demoting a Manager who still has creators needs a decision (D-46): move them
// to another Manager (reassign_to) or release them (release_team: true).
// Without either the API answers 409 with the team size.
router.patch("/users/:id", async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(400).json({ message: "Invalid user id" });
  }
  const { role, manager_id: managerId, status, reassign_to: reassignTo, release_team: releaseTeam } = req.body || {};
  const isSelf = req.params.id === req.user.sub;

  if (role !== undefined && !ROLES.includes(role)) {
    return res.status(400).json({ message: `role must be one of ${ROLES.join(", ")}` });
  }
  if (status !== undefined && !STATUSES.includes(status)) {
    return res.status(400).json({ message: `status must be one of ${STATUSES.join(", ")}` });
  }
  // Stops an Admin locking themselves out.
  if (isSelf && ((role !== undefined && role !== "Admin") || status === "deactivated")) {
    return res.status(400).json({ message: "You can't remove your own admin access" });
  }

  const user = await User.findById(req.params.id);
  if (!user) return res.status(404).json({ message: "User not found" });

  const wasManager = user.role === "Manager";
  const leavingManager = wasManager && role !== undefined && role !== "Manager";
  let newManager = null;
  if (leavingManager) {
    const teamSize = await User.countDocuments({ manager_id: user._id });
    if (teamSize > 0) {
      if (reassignTo) {
        if (!mongoose.isValidObjectId(reassignTo) || String(reassignTo) === String(user._id)) {
          return res.status(400).json({ message: "reassign_to must be another Manager" });
        }
        newManager = await User.findOne({ _id: reassignTo, role: "Manager", status: { $ne: "deactivated" } });
        if (!newManager) return res.status(400).json({ message: "reassign_to must be another active Manager" });
      } else if (releaseTeam !== true) {
        return res.status(409).json({
          code: "TEAM_NOT_EMPTY",
          team_size: teamSize,
          message: `This manager has ${teamSize} creator${teamSize === 1 ? "" : "s"}. Move them to another manager or release them first.`,
        });
      }
    }
  }

  if (role !== undefined && role !== user.role) {
    user.role = role;
    user.role_changed_at = new Date();
    user.role_changed_by = req.user.sub;
  }
  if (status !== undefined) user.status = status;

  if (managerId !== undefined) {
    if (managerId === null || managerId === "") {
      user.manager_id = null;
    } else {
      if (user.role !== "Creator") {
        return res.status(400).json({ message: "Only Creators can be assigned to a manager" });
      }
      if (!mongoose.isValidObjectId(managerId)) {
        return res.status(400).json({ message: "Invalid manager id" });
      }
      const manager = await User.findOne({ _id: managerId, role: "Manager" });
      if (!manager) {
        return res.status(400).json({ message: "manager_id must belong to a Manager" });
      }
      user.manager_id = manager._id;
    }
  }
  // Only Creators sit on a team.
  if (user.role !== "Creator") user.manager_id = null;

  await user.save();
  if (wasManager && user.role !== "Manager") {
    await User.updateMany(
      { manager_id: user._id },
      { $set: { manager_id: newManager ? newManager._id : null } }
    );
  }

  res.json({ id: user._id, role: user.role, status: user.status, manager_id: user.manager_id });
});

// GET /api/v1/admin/users/:id/summary - what deleting this account would remove.
router.get("/users/:id/summary", async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(400).json({ message: "Invalid user id" });
  }
  const user = await User.findById(req.params.id).select("_id");
  if (!user) return res.status(404).json({ message: "User not found" });
  res.json(await accountSummary(user._id));
});

// DELETE /api/v1/admin/users/:id - permanent (D-45). Admins can't be deleted,
// including yourself; demote another Admin first if it really has to go.
router.delete("/users/:id", async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(400).json({ message: "Invalid user id" });
  }
  if (req.params.id === req.user.sub) {
    return res.status(400).json({ message: "You can't delete your own account" });
  }
  const user = await User.findById(req.params.id);
  if (!user) return res.status(404).json({ message: "User not found" });
  if (user.role === "Admin") {
    return res.status(403).json({ message: "Admin accounts can't be deleted" });
  }
  const removed = await deleteAccount(user._id);
  res.json({ deleted: true, removed });
});

// GET /api/v1/admin/analytics - system-wide totals (PRD §3.1 /admin/analytics).
router.get("/analytics", async (req, res) => {
  const weekAgo = new Date(Date.now() - WEEK_MS);
  const [roles, inactive, thumbnails, uploadsThisWeek, scoredIds, predictions, testsByStatus, exportsByFormat, completed] =
    await Promise.all([
      User.aggregate([{ $group: { _id: "$role", count: { $sum: 1 } } }]),
      User.countDocuments({ status: "deactivated" }),
      Thumbnail.countDocuments(),
      Thumbnail.countDocuments({ uploaded_at: { $gte: weekAgo } }),
      Prediction.distinct("thumbnail_id"),
      Prediction.countDocuments(),
      ABTest.aggregate([{ $group: { _id: "$status", count: { $sum: 1 } } }]),
      ReportExport.aggregate([{ $group: { _id: "$format", count: { $sum: 1 } } }]),
      ABTest.find({ status: "COMPLETED", winner_variant_id: { $ne: null } }),
    ]);

  // System-wide AI accuracy: how often the top-scored variant won a completed test.
  let correct = 0;
  let checked = 0;
  for (const test of completed) {
    const preds = await latestPredictions(test.variants);
    const matched = predictionMatchedWinner(test.variants, preds, test.winner_variant_id);
    if (matched !== null) {
      checked += 1;
      if (matched) correct += 1;
    }
  }

  const toObject = (rows) => Object.fromEntries(rows.map((r) => [r._id, r.count]));
  const usersByRole = { Creator: 0, Manager: 0, Admin: 0, ...toObject(roles) };

  res.json({
    users: {
      total: Object.values(usersByRole).reduce((a, b) => a + b, 0),
      by_role: usersByRole,
      inactive,
    },
    thumbnails: { total: thumbnails, scored: scoredIds.length, uploaded_last_7_days: uploadsThisWeek },
    predictions_total: predictions,
    ab_tests: { RUNNING: 0, COMPLETED: 0, CANCELLED: 0, ...toObject(testsByStatus) },
    prediction_accuracy: { correct, total: checked },
    reports_exported: { csv: 0, pdf: 0, ...toObject(exportsByFormat) },
  });
});

// GET /api/v1/admin/model-info
// Proxied from the AI service, so the browser never talks to it directly (ADR-002).
router.get("/model-info", async (req, res) => {
  const aiServiceUrl = process.env.AI_SERVICE_URL || "http://localhost:8000";
  try {
    const response = await fetch(`${aiServiceUrl}/api/v1/model-info`, { signal: AbortSignal.timeout(5000) });
    if (!response.ok) throw new Error(`AI service returned ${response.status}`);
    res.json({ ai_service: { reachable: true }, ...(await response.json()) });
  } catch (err) {
    res.json({ ai_service: { reachable: false } });
  }
});

module.exports = router;
