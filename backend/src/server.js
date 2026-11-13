require("dotenv").config();

const express = require("express");
const cors = require("cors");

const connectDB = require("./config/db");
const { UPLOAD_DIR } = require("./config/uploadDir");
const authRoutes = require("./routes/auth");
const thumbnailRoutes = require("./routes/thumbnails");
const predictionRoutes = require("./routes/predictions");
const abtestRoutes = require("./routes/abtests");
const reportRoutes = require("./routes/reports");
const dashboardRoutes = require("./routes/dashboard");

const app = express();

app.use(cors());
app.use(express.json());
// Serve from the same folder uploads are written to (UPLOAD_DIR), not a hard-coded path.
app.use("/uploads", express.static(UPLOAD_DIR));

app.get("/api/v1/health", (req, res) => {
  res.json({ status: "ok" });
});

app.use("/api/v1/auth", authRoutes);
app.use("/api/v1/thumbnails", thumbnailRoutes);
app.use("/api/v1/predictions", predictionRoutes);
app.use("/api/v1/abtests", abtestRoutes);
app.use("/api/v1/reports", reportRoutes);
app.use("/api/v1/dashboard", dashboardRoutes);

const PORT = process.env.PORT || 5000;

if (require.main === module) {
  connectDB().then(() => {
    app.listen(PORT, () => console.log(`Backend API listening on port ${PORT}`));
  });
}

module.exports = app;
