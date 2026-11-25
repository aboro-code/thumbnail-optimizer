const mongoose = require("mongoose");

const runMigrations = require("./migrations");

async function connectDB() {
  const uri = process.env.MONGODB_URI || "mongodb://localhost:27017/thumbnail_optimizer";
  await mongoose.connect(uri);
  console.log("Connected to MongoDB");
  await runMigrations();
}

module.exports = connectDB;
