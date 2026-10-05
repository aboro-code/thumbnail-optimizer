require("dotenv").config();

const readline = require("readline");

const bcrypt = require("bcryptjs");
const mongoose = require("mongoose");

const User = require("../src/models/User");

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LENGTH = 8;

async function createAdmin({ email, password }) {
  if (!email || !EMAIL_RE.test(email)) {
    throw new Error("A valid email is required");
  }

  const normalized = email.toLowerCase();
  const existing = await User.findOne({ email: normalized });

  if (existing) {
    existing.role = "Admin";
    existing.profile_complete = true;
    await existing.save();
    return { user: existing, created: false };
  }

  if (!password || password.length < MIN_PASSWORD_LENGTH) {
    throw new Error(`Password must be at least ${MIN_PASSWORD_LENGTH} characters`);
  }

  const password_hash = await bcrypt.hash(password, 12);
  const user = await User.create({
    email: normalized,
    password_hash,
    role: "Admin",
    profile_complete: true,
  });
  return { user, created: true };
}

function prompt(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

async function main() {
  const email = process.argv[2] || (await prompt("Admin email: "));
  if (!EMAIL_RE.test(email)) {
    throw new Error("A valid email is required");
  }

  await mongoose.connect(process.env.MONGODB_URI || "mongodb://localhost:27017/thumbnail_optimizer");

  try {
    const isExisting = await User.exists({ email: email.toLowerCase() });
    const password = isExisting ? undefined : await prompt("Password (min 8 characters): ");

    const { user, created } = await createAdmin({ email, password });
    console.log(
      created
        ? `Created admin account for ${user.email}`
        : `Promoted existing account ${user.email} to Admin (password unchanged)`
    );
  } finally {
    await mongoose.disconnect();
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
}

module.exports = { createAdmin };
