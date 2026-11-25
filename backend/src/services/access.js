const mongoose = require("mongoose");

const User = require("../models/User");

// Who can see whose data (D-37, replaces D-08 "Managers see everything"):
//   Admin   -> everyone
//   Manager -> themselves + the Creators on their team (users.manager_id = manager)
//   Creator -> only themselves
// Returns null for "no restriction", otherwise a list of user id strings.
async function visibleUserIds(user) {
  if (user.role === "Admin") return null;
  if (user.role === "Manager" && mongoose.isValidObjectId(user.sub)) {
    const members = await User.find({ manager_id: user.sub }).select("_id").lean();
    return [user.sub, ...members.map((m) => m._id.toString())];
  }
  return [user.sub];
}

// Mongo filter limiting a query to the documents this user may see.
// `field` is the owner field: user_id on thumbnails/exports, owner_id on A/B tests.
async function ownerFilter(user, field = "user_id") {
  const ids = await visibleUserIds(user);
  if (ids === null) return {};
  return { [field]: { $in: ids.filter((id) => mongoose.isValidObjectId(id)).map((id) => new mongoose.Types.ObjectId(id)) } };
}

async function canAccessOwner(user, ownerId) {
  const ids = await visibleUserIds(user);
  if (!ownerId) return ids === null;
  return ids === null || ids.includes(ownerId.toString());
}

async function canAccessAllOwners(user, ownerIds) {
  const ids = await visibleUserIds(user);
  return ids === null || ownerIds.every((id) => ids.includes(id.toString()));
}

module.exports = { visibleUserIds, ownerFilter, canAccessOwner, canAccessAllOwners };
