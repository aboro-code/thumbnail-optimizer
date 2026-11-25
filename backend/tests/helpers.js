const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");

const User = require("../src/models/User");

// Signs a token AND makes sure a matching active user exists, because
// requireAuth loads the role and status from the database on every request.
async function tokenFor(role, sub = new mongoose.Types.ObjectId().toString()) {
  const id = String(sub);
  await User.updateOne(
    { _id: id },
    { $set: { role }, $setOnInsert: { email: `${id}@test.local`, password_hash: "x", status: "active" } },
    { upsert: true }
  );
  return jwt.sign({ sub: id, role }, process.env.JWT_SECRET, { expiresIn: "1h" });
}

module.exports = { tokenFor };
