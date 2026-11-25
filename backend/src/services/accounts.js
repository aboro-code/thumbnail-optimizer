const fs = require("fs");
const path = require("path");

const User = require("../models/User");
const Thumbnail = require("../models/Thumbnail");
const Prediction = require("../models/Prediction");
const ABTest = require("../models/ABTest");
const ReportExport = require("../models/ReportExport");
const RefreshToken = require("../models/RefreshToken");
const { UPLOAD_DIR } = require("../config/uploadDir");

// What deleting this account would remove, for the confirm dialogs.
async function accountSummary(userId) {
  const [thumbnails, abTests, reports, teamMembers] = await Promise.all([
    Thumbnail.countDocuments({ user_id: userId }),
    ABTest.countDocuments({ owner_id: userId }),
    ReportExport.countDocuments({ user_id: userId }),
    User.countDocuments({ manager_id: userId }),
  ]);
  return { thumbnails, ab_tests: abTests, reports, team_members: teamMembers };
}

function removeUploadedFile(imageUrl) {
  if (typeof imageUrl !== "string" || !imageUrl.startsWith("/uploads/")) return;
  // basename() keeps the delete inside UPLOAD_DIR even if the stored URL were tampered with.
  const file = path.join(UPLOAD_DIR, path.basename(imageUrl));
  fs.promises.unlink(file).catch(() => {});
}

// Permanently deletes an account and everything it owns (D-45):
// thumbnails (+ image files), their predictions, the A/B tests it owns, its
// report history and its sessions. A Manager's team is released first, so the
// creators keep their accounts and data. Tests this user only *started* for
// someone else belong to that person (owner_id) and are kept.
async function deleteAccount(userId) {
  await User.updateMany({ manager_id: userId }, { $set: { manager_id: null } });

  const thumbnails = await Thumbnail.find({ user_id: userId }).select("_id image_url").lean();
  const thumbnailIds = thumbnails.map((t) => t._id);
  const tests = await ABTest.find({ owner_id: userId }).select("_id").lean();
  const testIds = tests.map((t) => t._id);

  await Promise.all([
    Prediction.deleteMany({ thumbnail_id: { $in: thumbnailIds } }),
    ABTest.deleteMany({ _id: { $in: testIds } }),
    ReportExport.deleteMany({ $or: [{ user_id: userId }, { ab_test_id: { $in: testIds } }] }),
    RefreshToken.deleteMany({ user_id: userId }),
  ]);
  await Thumbnail.deleteMany({ _id: { $in: thumbnailIds } });
  await User.deleteOne({ _id: userId });

  thumbnails.forEach((t) => removeUploadedFile(t.image_url));
  return { thumbnails: thumbnailIds.length, ab_tests: testIds.length };
}

module.exports = { accountSummary, deleteAccount };
