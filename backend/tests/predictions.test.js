const fs = require("fs");
const os = require("os");
const path = require("path");

const testUploadDir = fs.mkdtempSync(path.join(os.tmpdir(), "thumbnail-uploads-"));
process.env.UPLOAD_DIR = testUploadDir;
process.env.AI_SERVICE_URL = "http://127.0.0.1:18321";

const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");
const request = require("supertest");
const express = require("express");
const multer = require("multer");
const { MongoMemoryServer } = require("mongodb-memory-server");

const app = require("../src/server");
const Thumbnail = require("../src/models/Thumbnail");
const Prediction = require("../src/models/Prediction");

let mongod;
let mockAiServer;

function tokenFor(role, sub = new mongoose.Types.ObjectId().toString()) {
  return jwt.sign({ sub, role }, process.env.JWT_SECRET, { expiresIn: "1h" });
}

function startMockAiService() {
  const mockAi = express();
  mockAi.use(multer().any());
  mockAi.post("/api/v1/score", (req, res) => {
    const title = req.body.content_title || "";
    const match = title.match(/score:(\d+(\.\d+)?)/);
    const ctr_score = match ? parseFloat(match[1]) : 50;
    res.json({ ctr_score, explanation_signals: [`mock signal for ${title || "untitled"}`] });
  });
  return new Promise((resolve) => {
    const server = mockAi.listen(18321, () => resolve(server));
  });
}

async function createThumbnail(userId, { contentTitle, extension = ".jpg" } = {}) {
  const filename = `${new mongoose.Types.ObjectId()}${extension}`;
  await fs.promises.writeFile(path.join(testUploadDir, filename), Buffer.from([0xff, 0xd8, 0xff]));
  return Thumbnail.create({
    user_id: userId,
    image_url: `/uploads/${filename}`,
    content_title: contentTitle,
    status: "UPLOADED",
  });
}

beforeAll(async () => {
  process.env.JWT_SECRET = "test-secret";
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
  mockAiServer = await startMockAiService();
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
  await new Promise((resolve) => mockAiServer.close(resolve));
  fs.rmSync(testUploadDir, { recursive: true, force: true });
});

afterEach(async () => {
  await mongoose.connection.db.dropDatabase();
});

describe("POST /api/v1/predictions/analyze", () => {
  it("scores a batch, ranks by score, and persists predictions", async () => {
    const userId = new mongoose.Types.ObjectId().toString();
    const low = await createThumbnail(userId, { contentTitle: "score:40" });
    const high = await createThumbnail(userId, { contentTitle: "score:90" });

    const res = await request(app)
      .post("/api/v1/predictions/analyze")
      .set("Authorization", `Bearer ${tokenFor("Creator", userId)}`)
      .send({ thumbnail_ids: [low._id.toString(), high._id.toString()] });

    expect(res.status).toBe(200);
    expect(res.body.results).toHaveLength(2);

    const highResult = res.body.results.find((r) => r.thumbnail_id === high._id.toString());
    const lowResult = res.body.results.find((r) => r.thumbnail_id === low._id.toString());
    expect(highResult.rank).toBe(1);
    expect(lowResult.rank).toBe(2);
    expect(highResult.ctr_score).toBe(90);
    expect(lowResult.ctr_score).toBe(40);

    const saved = await Prediction.find({});
    expect(saved).toHaveLength(2);

    const updatedThumb = await Thumbnail.findById(high._id);
    expect(updatedThumb.status).toBe("SCORED");
  });

  it("rejects an empty thumbnail_ids array", async () => {
    const res = await request(app)
      .post("/api/v1/predictions/analyze")
      .set("Authorization", `Bearer ${tokenFor("Creator")}`)
      .send({ thumbnail_ids: [] });

    expect(res.status).toBe(400);
  });

  it("rejects a malformed thumbnail id", async () => {
    const res = await request(app)
      .post("/api/v1/predictions/analyze")
      .set("Authorization", `Bearer ${tokenFor("Creator")}`)
      .send({ thumbnail_ids: ["not-an-id"] });

    expect(res.status).toBe(400);
  });

  it("returns 404 when a thumbnail does not exist", async () => {
    const res = await request(app)
      .post("/api/v1/predictions/analyze")
      .set("Authorization", `Bearer ${tokenFor("Creator")}`)
      .send({ thumbnail_ids: [new mongoose.Types.ObjectId().toString()] });

    expect(res.status).toBe(404);
  });

  it("blocks a Creator from scoring someone else's thumbnail", async () => {
    const owner = new mongoose.Types.ObjectId().toString();
    const thumb = await createThumbnail(owner);

    const res = await request(app)
      .post("/api/v1/predictions/analyze")
      .set("Authorization", `Bearer ${tokenFor("Creator")}`)
      .send({ thumbnail_ids: [thumb._id.toString()] });

    expect(res.status).toBe(403);
  });

  it("lets a Manager score another user's thumbnail", async () => {
    const owner = new mongoose.Types.ObjectId().toString();
    const thumb = await createThumbnail(owner, { contentTitle: "score:60" });

    const res = await request(app)
      .post("/api/v1/predictions/analyze")
      .set("Authorization", `Bearer ${tokenFor("Manager")}`)
      .send({ thumbnail_ids: [thumb._id.toString()] });

    expect(res.status).toBe(200);
    expect(res.body.results[0].ctr_score).toBe(60);
  });

  it("returns 502 when the AI service is unreachable", async () => {
    const originalUrl = process.env.AI_SERVICE_URL;
    process.env.AI_SERVICE_URL = "http://127.0.0.1:1";

    const userId = new mongoose.Types.ObjectId().toString();
    const thumb = await createThumbnail(userId);

    const res = await request(app)
      .post("/api/v1/predictions/analyze")
      .set("Authorization", `Bearer ${tokenFor("Creator", userId)}`)
      .send({ thumbnail_ids: [thumb._id.toString()] });

    expect(res.status).toBe(502);
    process.env.AI_SERVICE_URL = originalUrl;
  });
});
