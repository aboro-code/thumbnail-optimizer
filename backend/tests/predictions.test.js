const fs = require("fs");
const os = require("os");
const path = require("path");

const testUploadDir = fs.mkdtempSync(path.join(os.tmpdir(), "thumbnail-uploads-"));
process.env.UPLOAD_DIR = testUploadDir;
process.env.AI_SERVICE_URL = "http://127.0.0.1:18321";

const mongoose = require("mongoose");
const request = require("supertest");
const express = require("express");
const multer = require("multer");
const { MongoMemoryServer } = require("mongodb-memory-server");

const app = require("../src/server");
const { tokenFor } = require("./helpers");
const Thumbnail = require("../src/models/Thumbnail");
const Prediction = require("../src/models/Prediction");

let mongod;
let mockAiServer;


function startMockAiService() {
  const mockAi = express();
  mockAi.use(multer().any());
  mockAi.post("/api/v1/score", (req, res) => {
    const title = req.body.content_title || "";
    const match = title.match(/score:(\d+(\.\d+)?)/);
    const ctr_score = match ? parseFloat(match[1]) : 50;
    res.json({
      ctr_score,
      explanation_signals: [`mock signal for ${title || "untitled"}`],
      explanation_text: req.body.explain === "false" ? null : `mock explanation for ${title || "untitled"}`,
    });
  });
  mockAi.post("/api/v1/explain", express.json(), (req, res) => {
    res.json({ explanation_text: `mock explanation for score ${req.body.ctr_score}` });
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
      .set("Authorization", `Bearer ${await tokenFor("Creator", userId)}`)
      .send({ thumbnail_ids: [low._id.toString(), high._id.toString()] });

    expect(res.status).toBe(200);
    expect(res.body.results).toHaveLength(2);

    const highResult = res.body.results.find((r) => r.thumbnail_id === high._id.toString());
    const lowResult = res.body.results.find((r) => r.thumbnail_id === low._id.toString());
    expect(highResult.rank).toBe(1);
    expect(lowResult.rank).toBe(2);
    expect(highResult.ctr_score).toBe(90);
    expect(lowResult.ctr_score).toBe(40);

    // Scores come back without waiting for the LLM (D-47).
    expect(highResult.explanation_text).toBeNull();
    expect(highResult.explanation_signals).toEqual(["mock signal for score:90"]);

    const saved = await Prediction.find({});
    expect(saved).toHaveLength(2);

    const updatedThumb = await Thumbnail.findById(high._id);
    expect(updatedThumb.status).toBe("SCORED");
  });

  it("writes the explanation afterwards with POST /predictions/explain, once", async () => {
    const userId = new mongoose.Types.ObjectId().toString();
    const thumb = await createThumbnail(userId, { contentTitle: "score:70" });
    const token = await tokenFor("Creator", userId);
    await request(app).post("/api/v1/predictions/analyze").set("Authorization", `Bearer ${token}`).send({ thumbnail_ids: [String(thumb._id)] });

    const res = await request(app)
      .post("/api/v1/predictions/explain")
      .set("Authorization", `Bearer ${token}`)
      .send({ thumbnail_id: String(thumb._id) })
      .expect(200);
    expect(res.body.explanation_text).toBe("mock explanation for score 70");
    expect((await Prediction.findOne({ thumbnail_id: thumb._id })).explanation_text).toBe("mock explanation for score 70");

    const other = await tokenFor("Creator");
    await request(app).post("/api/v1/predictions/explain").set("Authorization", `Bearer ${other}`).send({ thumbnail_id: String(thumb._id) }).expect(403);
  });

  it("asks for a score before an explanation", async () => {
    const userId = new mongoose.Types.ObjectId().toString();
    const thumb = await createThumbnail(userId);
    await request(app)
      .post("/api/v1/predictions/explain")
      .set("Authorization", `Bearer ${await tokenFor("Creator", userId)}`)
      .send({ thumbnail_id: String(thumb._id) })
      .expect(409);
  });

  it("rejects an empty thumbnail_ids array", async () => {
    const res = await request(app)
      .post("/api/v1/predictions/analyze")
      .set("Authorization", `Bearer ${await tokenFor("Creator")}`)
      .send({ thumbnail_ids: [] });

    expect(res.status).toBe(400);
  });

  it("rejects a malformed thumbnail id", async () => {
    const res = await request(app)
      .post("/api/v1/predictions/analyze")
      .set("Authorization", `Bearer ${await tokenFor("Creator")}`)
      .send({ thumbnail_ids: ["not-an-id"] });

    expect(res.status).toBe(400);
  });

  it("returns 404 when a thumbnail does not exist", async () => {
    const res = await request(app)
      .post("/api/v1/predictions/analyze")
      .set("Authorization", `Bearer ${await tokenFor("Creator")}`)
      .send({ thumbnail_ids: [new mongoose.Types.ObjectId().toString()] });

    expect(res.status).toBe(404);
  });

  it("blocks a Creator from scoring someone else's thumbnail", async () => {
    const owner = new mongoose.Types.ObjectId().toString();
    const thumb = await createThumbnail(owner);

    const res = await request(app)
      .post("/api/v1/predictions/analyze")
      .set("Authorization", `Bearer ${await tokenFor("Creator")}`)
      .send({ thumbnail_ids: [thumb._id.toString()] });

    expect(res.status).toBe(403);
  });

  it("lets an Admin score another user's thumbnail", async () => {
    const owner = new mongoose.Types.ObjectId().toString();
    const thumb = await createThumbnail(owner, { contentTitle: "score:60" });

    const res = await request(app)
      .post("/api/v1/predictions/analyze")
      .set("Authorization", `Bearer ${await tokenFor("Admin")}`)
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
      .set("Authorization", `Bearer ${await tokenFor("Creator", userId)}`)
      .send({ thumbnail_ids: [thumb._id.toString()] });

    expect(res.status).toBe(502);
    process.env.AI_SERVICE_URL = originalUrl;
  });
});
