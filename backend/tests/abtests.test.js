const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");
const request = require("supertest");
const { MongoMemoryServer } = require("mongodb-memory-server");

const app = require("../src/server");
const Thumbnail = require("../src/models/Thumbnail");
const Prediction = require("../src/models/Prediction");
const ABTest = require("../src/models/ABTest");

let mongod;

function tokenFor(role, sub = new mongoose.Types.ObjectId().toString()) {
  return jwt.sign({ sub, role }, process.env.JWT_SECRET, { expiresIn: "1h" });
}

async function createThumbnail(userId) {
  return Thumbnail.create({ user_id: userId, image_url: "/uploads/a.jpg", status: "UPLOADED" });
}

beforeAll(async () => {
  process.env.JWT_SECRET = "test-secret";
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

afterEach(async () => {
  await mongoose.connection.db.dropDatabase();
});

describe("POST /api/v1/abtests", () => {
  it("creates a running test and marks variant thumbnails TESTING", async () => {
    const userId = new mongoose.Types.ObjectId().toString();
    const a = await createThumbnail(userId);
    const b = await createThumbnail(userId);

    const res = await request(app)
      .post("/api/v1/abtests")
      .set("Authorization", `Bearer ${tokenFor("Creator", userId)}`)
      .send({
        content_reference: "youtube.com/watch?v=abc123",
        variant_thumbnail_ids: [a._id.toString(), b._id.toString()],
        start_date: "2026-09-05",
        end_date: "2026-09-12",
      });

    expect(res.status).toBe(201);
    expect(res.body.status).toBe("RUNNING");
    expect(res.body.variants).toBe(2);

    const updatedA = await Thumbnail.findById(a._id);
    expect(updatedA.status).toBe("TESTING");
  });

  it("rejects fewer than 2 variants", async () => {
    const userId = new mongoose.Types.ObjectId().toString();
    const a = await createThumbnail(userId);

    const res = await request(app)
      .post("/api/v1/abtests")
      .set("Authorization", `Bearer ${tokenFor("Creator", userId)}`)
      .send({
        content_reference: "ref",
        variant_thumbnail_ids: [a._id.toString()],
        start_date: "2026-09-05",
        end_date: "2026-09-12",
      });

    expect(res.status).toBe(400);
  });

  it("rejects an end_date before start_date", async () => {
    const userId = new mongoose.Types.ObjectId().toString();
    const a = await createThumbnail(userId);
    const b = await createThumbnail(userId);

    const res = await request(app)
      .post("/api/v1/abtests")
      .set("Authorization", `Bearer ${tokenFor("Creator", userId)}`)
      .send({
        content_reference: "ref",
        variant_thumbnail_ids: [a._id.toString(), b._id.toString()],
        start_date: "2026-09-12",
        end_date: "2026-09-05",
      });

    expect(res.status).toBe(400);
  });

  it("returns 404 when a variant thumbnail does not exist", async () => {
    const userId = new mongoose.Types.ObjectId().toString();
    const a = await createThumbnail(userId);

    const res = await request(app)
      .post("/api/v1/abtests")
      .set("Authorization", `Bearer ${tokenFor("Creator", userId)}`)
      .send({
        content_reference: "ref",
        variant_thumbnail_ids: [a._id.toString(), new mongoose.Types.ObjectId().toString()],
        start_date: "2026-09-05",
        end_date: "2026-09-12",
      });

    expect(res.status).toBe(404);
  });

  it("blocks a Creator from using someone else's thumbnail as a variant", async () => {
    const owner = new mongoose.Types.ObjectId().toString();
    const a = await createThumbnail(owner);
    const b = await createThumbnail(owner);

    const res = await request(app)
      .post("/api/v1/abtests")
      .set("Authorization", `Bearer ${tokenFor("Creator")}`)
      .send({
        content_reference: "ref",
        variant_thumbnail_ids: [a._id.toString(), b._id.toString()],
        start_date: "2026-09-05",
        end_date: "2026-09-12",
      });

    expect(res.status).toBe(403);
  });
});

describe("PATCH /api/v1/abtests/:id/variants/:variantId/metrics", () => {
  async function createRunningTest(userId) {
    const a = await createThumbnail(userId);
    const b = await createThumbnail(userId);
    const abTest = await ABTest.create({
      created_by: userId,
      content_reference: "ref",
      start_date: new Date("2026-09-05"),
      end_date: new Date("2026-09-12"),
      variants: [{ thumbnail_id: a._id }, { thumbnail_id: b._id }],
    });
    return { abTest, a, b };
  }

  it("records impressions/clicks and computes measured_ctr", async () => {
    const userId = new mongoose.Types.ObjectId().toString();
    const { abTest } = await createRunningTest(userId);
    const variantId = abTest.variants[0]._id.toString();

    const res = await request(app)
      .patch(`/api/v1/abtests/${abTest._id}/variants/${variantId}/metrics`)
      .set("Authorization", `Bearer ${tokenFor("Creator", userId)}`)
      .send({ impressions: 200, clicks: 25 });

    expect(res.status).toBe(200);
    expect(res.body.measured_ctr).toBeCloseTo(0.125);
  });

  it("rejects clicks exceeding impressions", async () => {
    const userId = new mongoose.Types.ObjectId().toString();
    const { abTest } = await createRunningTest(userId);
    const variantId = abTest.variants[0]._id.toString();

    const res = await request(app)
      .patch(`/api/v1/abtests/${abTest._id}/variants/${variantId}/metrics`)
      .set("Authorization", `Bearer ${tokenFor("Creator", userId)}`)
      .send({ impressions: 10, clicks: 50 });

    expect(res.status).toBe(400);
  });

  it("returns 404 for an unknown variant id", async () => {
    const userId = new mongoose.Types.ObjectId().toString();
    const { abTest } = await createRunningTest(userId);

    const res = await request(app)
      .patch(`/api/v1/abtests/${abTest._id}/variants/${new mongoose.Types.ObjectId()}/metrics`)
      .set("Authorization", `Bearer ${tokenFor("Creator", userId)}`)
      .send({ impressions: 10, clicks: 1 });

    expect(res.status).toBe(404);
  });

  it("blocks a non-owner Creator from recording metrics", async () => {
    const owner = new mongoose.Types.ObjectId().toString();
    const { abTest } = await createRunningTest(owner);
    const variantId = abTest.variants[0]._id.toString();

    const res = await request(app)
      .patch(`/api/v1/abtests/${abTest._id}/variants/${variantId}/metrics`)
      .set("Authorization", `Bearer ${tokenFor("Creator")}`)
      .send({ impressions: 10, clicks: 1 });

    expect(res.status).toBe(403);
  });
});

describe("PATCH /api/v1/abtests/:id/status", () => {
  async function createRunningTestWithMetrics(userId, { aCtr, bCtr } = {}) {
    const a = await createThumbnail(userId);
    const b = await createThumbnail(userId);
    const abTest = await ABTest.create({
      created_by: userId,
      content_reference: "ref",
      start_date: new Date("2026-09-05"),
      end_date: new Date("2026-09-12"),
      variants: [
        { thumbnail_id: a._id, impressions: 1000, clicks: aCtr ? aCtr * 1000 : 0, measured_ctr: aCtr || 0 },
        { thumbnail_id: b._id, impressions: 1000, clicks: bCtr ? bCtr * 1000 : 0, measured_ctr: bCtr || 0 },
      ],
    });
    return { abTest, a, b };
  }

  it("declares the higher-measured_ctr variant the winner", async () => {
    const userId = new mongoose.Types.ObjectId().toString();
    const { abTest, b } = await createRunningTestWithMetrics(userId, { aCtr: 0.05, bCtr: 0.12 });

    const res = await request(app)
      .patch(`/api/v1/abtests/${abTest._id}/status`)
      .set("Authorization", `Bearer ${tokenFor("Manager")}`)
      .send({ status: "COMPLETED" });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("COMPLETED");
    expect(res.body.winner_variant_id).toBe(abTest.variants[1]._id.toString());

    const updatedB = await Thumbnail.findById(b._id);
    expect(updatedB.status).toBe("COMPLETED");
  });

  it("reports prediction_matched_winner true when the prediction agrees", async () => {
    const userId = new mongoose.Types.ObjectId().toString();
    const { abTest, a, b } = await createRunningTestWithMetrics(userId, { aCtr: 0.05, bCtr: 0.12 });

    await Prediction.create({ thumbnail_id: a._id, ctr_score: 40, rank: 2, explanation_signals: [] });
    await Prediction.create({ thumbnail_id: b._id, ctr_score: 80, rank: 1, explanation_signals: [] });

    const res = await request(app)
      .patch(`/api/v1/abtests/${abTest._id}/status`)
      .set("Authorization", `Bearer ${tokenFor("Manager")}`)
      .send({ status: "COMPLETED" });

    expect(res.body.prediction_matched_winner).toBe(true);
  });

  it("reports prediction_matched_winner false when the prediction disagrees", async () => {
    const userId = new mongoose.Types.ObjectId().toString();
    const { abTest, a, b } = await createRunningTestWithMetrics(userId, { aCtr: 0.05, bCtr: 0.12 });

    await Prediction.create({ thumbnail_id: a._id, ctr_score: 90, rank: 1, explanation_signals: [] });
    await Prediction.create({ thumbnail_id: b._id, ctr_score: 30, rank: 2, explanation_signals: [] });

    const res = await request(app)
      .patch(`/api/v1/abtests/${abTest._id}/status`)
      .set("Authorization", `Bearer ${tokenFor("Manager")}`)
      .send({ status: "COMPLETED" });

    expect(res.body.prediction_matched_winner).toBe(false);
  });

  it("reports prediction_matched_winner null when a variant was never scored", async () => {
    const userId = new mongoose.Types.ObjectId().toString();
    const { abTest } = await createRunningTestWithMetrics(userId, { aCtr: 0.05, bCtr: 0.12 });

    const res = await request(app)
      .patch(`/api/v1/abtests/${abTest._id}/status`)
      .set("Authorization", `Bearer ${tokenFor("Manager")}`)
      .send({ status: "COMPLETED" });

    expect(res.body.prediction_matched_winner).toBeNull();
  });

  it("rejects closing a test that is already closed", async () => {
    const userId = new mongoose.Types.ObjectId().toString();
    const { abTest } = await createRunningTestWithMetrics(userId, { aCtr: 0.05, bCtr: 0.12 });

    const first = await request(app)
      .patch(`/api/v1/abtests/${abTest._id}/status`)
      .set("Authorization", `Bearer ${tokenFor("Manager")}`)
      .send({ status: "COMPLETED" });
    expect(first.status).toBe(200);

    const second = await request(app)
      .patch(`/api/v1/abtests/${abTest._id}/status`)
      .set("Authorization", `Bearer ${tokenFor("Manager")}`)
      .send({ status: "COMPLETED" });

    expect(second.status).toBe(409);
  });

  it("rejects an invalid status value", async () => {
    const userId = new mongoose.Types.ObjectId().toString();
    const { abTest } = await createRunningTestWithMetrics(userId);

    const res = await request(app)
      .patch(`/api/v1/abtests/${abTest._id}/status`)
      .set("Authorization", `Bearer ${tokenFor("Manager")}`)
      .send({ status: "RUNNING" });

    expect(res.status).toBe(400);
  });

  it("returns 404 for an unknown test id", async () => {
    const res = await request(app)
      .patch(`/api/v1/abtests/${new mongoose.Types.ObjectId()}/status`)
      .set("Authorization", `Bearer ${tokenFor("Manager")}`)
      .send({ status: "COMPLETED" });

    expect(res.status).toBe(404);
  });
});
