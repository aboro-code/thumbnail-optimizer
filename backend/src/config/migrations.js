const User = require("../models/User");
const ABTest = require("../models/ABTest");
const Thumbnail = require("../models/Thumbnail");

// Small idempotent data migrations, run once at start-up. Safe to run again.
async function runMigrations() {
  const users = User.collection;
  // D-42: active (boolean) -> status ("active" | "deactivated").
  await users.updateMany({ active: false }, { $set: { status: "deactivated" }, $unset: { active: "" } });
  await users.updateMany({ status: { $exists: false } }, { $set: { status: "active" }, $unset: { active: "" } });

  // D-44: every A/B test gets an owner_id = the owner of its thumbnails.
  const unowned = await ABTest.collection.find({ owner_id: { $exists: false } }).toArray();
  for (const test of unowned) {
    const ids = (test.variants || []).map((v) => v.thumbnail_id);
    const owners = await Thumbnail.distinct("user_id", { _id: { $in: ids } });
    // Old tests could mix owners; those keep the person who created them.
    const owner = owners.length === 1 ? owners[0] : test.created_by;
    await ABTest.collection.updateOne({ _id: test._id }, { $set: { owner_id: owner } });
    if (owners.length > 1) console.warn(`A/B test ${test._id} mixes thumbnail owners; owner set to its creator`);
  }
}

module.exports = runMigrations;
