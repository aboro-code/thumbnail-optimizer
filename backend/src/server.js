require("dotenv").config();
const path = require("path");

const express = require("express");
const cors = require("cors");

const connectDB = require("./config/db");
const authRoutes = require("./routes/auth");
const thumbnailRoutes = require("./routes/thumbnails");
const predictionRoutes = require("./routes/predictions");
const abtestRoutes = require("./routes/abtests");

const app = express();

app.use(cors());
app.use(express.json());
app.use("/uploads", express.static(path.join(__dirname, "..", "uploads")));

app.get("/api/v1/health", (req, res) => {
  res.json({ status: "ok" });
});

app.use("/api/v1/auth", authRoutes);
app.use("/api/v1/thumbnails", thumbnailRoutes);
app.use("/api/v1/predictions", predictionRoutes);
app.use("/api/v1/abtests", abtestRoutes);

const PORT = process.env.PORT || 5000;

if (require.main === module) {
  connectDB().then(() => {
    app.listen(PORT, () => console.log(`Backend API listening on port ${PORT}`));
  });
}

module.exports = app;
