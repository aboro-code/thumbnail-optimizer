const express = require("express");
const mongoose = require("mongoose");

const User = require("../models/User");
const { requireAuth, requireRole } = require("../middleware/auth");
const { ensureInviteCode, findManagerByCode, generateInviteCode } = require("../services/teams");

const router = express.Router();

function member(user) {
  return {
    id: user._id,
    email: user.email,
    name: user.name || null,
    status: user.status || "active",
    joined_at: user.created_at,
  };
}

function managerSummary(manager) {
  return { id: manager._id, email: manager.email, name: manager.name || null };
}

// GET /api/v1/team
// Manager: their invite code + the Creators on their team.
// Creator: the Manager they belong to (or null).
router.get("/", requireAuth, async (req, res) => {
  const me = await User.findById(req.user.sub);
  if (!me) return res.status(404).json({ message: "Account not found" });

  if (me.role === "Manager") {
    const inviteCode = await ensureInviteCode(me);
    const members = await User.find({ manager_id: me._id }).sort({ email: 1 });
    return res.json({ role: "Manager", invite_code: inviteCode, members: members.map(member) });
  }
  if (me.role === "Creator") {
    const manager = me.manager_id ? await User.findById(me.manager_id) : null;
    return res.json({ role: "Creator", manager: manager ? managerSummary(manager) : null });
  }
  res.json({ role: me.role });
});

// POST /api/v1/team/invite-code  (Manager)
// Replaces the code, e.g. after it was shared too widely. Creators already on the team stay.
router.post("/invite-code", requireAuth, requireRole("Manager"), async (req, res) => {
  const me = await User.findById(req.user.sub);
  if (!me) return res.status(404).json({ message: "Account not found" });
  me.invite_code = generateInviteCode();
  await me.save();
  res.json({ invite_code: me.invite_code });
});

// DELETE /api/v1/team/members/:id  (Manager) - remove a Creator from your team.
router.delete("/members/:id", requireAuth, requireRole("Manager"), async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(400).json({ message: "Invalid user id" });
  }
  const result = await User.updateOne(
    { _id: req.params.id, manager_id: req.user.sub },
    { $set: { manager_id: null } }
  );
  if (result.matchedCount === 0) {
    return res.status(404).json({ message: "That user is not on your team" });
  }
  res.status(204).end();
});

// POST /api/v1/team/join  (Creator) { invite_code }
router.post("/join", requireAuth, requireRole("Creator"), async (req, res) => {
  const manager = await findManagerByCode(req.body?.invite_code);
  if (!manager) {
    return res.status(400).json({ message: "That team code is not valid" });
  }
  await User.updateOne({ _id: req.user.sub }, { $set: { manager_id: manager._id } });
  res.json({ manager: managerSummary(manager) });
});

// POST /api/v1/team/leave  (Creator)
router.post("/leave", requireAuth, requireRole("Creator"), async (req, res) => {
  await User.updateOne({ _id: req.user.sub }, { $set: { manager_id: null } });
  res.status(204).end();
});

module.exports = router;
