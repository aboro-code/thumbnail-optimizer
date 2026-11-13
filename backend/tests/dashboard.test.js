const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");
const request = require("supertest");
const { MongoMemoryServer } = require("mongodb-memory-server");

const app = require("../src/server");
const Thumbnail = require("../src/models/Thumbnail");
const Prediction = require("../src/models/Prediction");
const ABTest = require("../src/models/ABTest");
const ReportExport = require("../src/models/ReportExport");

let mongod;

function tokenFor(role, sub = new mongoose.Types.ObjectId().toString()) {
  return jwt.sign({ sub, role }, process.env.JWT_SECRET, { expiresIn: "1h" });
}

async function thumbnail(userId, score) {
  const t = await Thumbnail.create({ user_id: userId, image_url: "/uploads/x.jpg" });
  if (score !== undefined) await Prediction.create({ thumbnail_id: t._id, ctr_score: score });
  return t;
}

function makeTest(ownerId, status, thumbs, winnerIdx = null) {
  const test = new ABTest({
    created_by: ownerId,
    content_reference: "ref",
    status,
    start_date: new Date("2026-11-01"),
    end_date: new Date("2026-11-08"),
    variants: thumbs.map((t) => ({ thumbnail_id: t._id })),
  });
  if (winnerIdx !== null) test.winner_variant_id = test.variants[winnerIdx]._id;
  return test.save();
}

// Creator: a=90, b=60, c=70, d=50, e unscored.
//   T1 COMPLETED [a,b], b won  -> AI picked a: wrong; lift 30
//   T2 RUNNING   [c,d]         -> lift 20
//   T3 COMPLETED [c,d], c won  -> AI picked c: right; lift 20
//   T4 COMPLETED [d,e]         -> e unscored: skipped
// Someone else: one thumbnail scored 10 and one export.
async function seed() {
  const creatorId = new mongoose.Types.ObjectId().toString();
  const [a, b, c, d, e] = [
    await thumbnail(creatorId, 90),
    await thumbnail(creatorId, 60),
    await thumbnail(creatorId, 70),
    await thumbnail(creatorId, 50),
    await thumbnail(creatorId),
  ];
  const t1 = await makeTest(creatorId, "COMPLETED", [a, b], 1);
  await makeTest(creatorId, "RUNNING", [c, d]);
  await makeTest(creatorId, "COMPLETED", [c, d], 0);
  await makeTest(creatorId, "COMPLETED", [d, e], 0);

  const otherId = new mongoose.Types.ObjectId().toString();
  await thumbnail(otherId, 10);
  await ReportExport.create({ user_id: creatorId, ab_test_id: t1._id, format: "pdf" });
  await ReportExport.create({ user_id: creatorId, ab_test_id: t1._id, format: "csv" });
  await ReportExport.create({ user_id: otherId, ab_test_id: t1._id, format: "pdf" });

  return { creatorId };
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

describe("GET /api/v1/dashboard/summary", () => {
  it("computes the PRD dashboard metrics for a Creator's own data", async () => {
    const { creatorId } = await seed();

    const res = await request(app)
      .get("/api/v1/dashboard/summary")
      .set("Authorization", `Bearer ${tokenFor("Creator", creatorId)}`);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      thumbnails_total: 5,
      thumbnails_scored: 4,
      active_tests: 1,
      completed_tests: 3,
      avg_predicted_lift: 23.3,
      prediction_accuracy: { correct: 1, total: 2 },
      reports_generated: 2,
    });

    const counts = Object.fromEntries(res.body.score_distribution.map((b) => [b.from, b.count]));
    expect(res.body.score_distribution).toHaveLength(10);
    expect(counts).toMatchObject({ 50: 1, 60: 1, 70: 1, 90: 1, 10: 0 });
  });

  it("includes everyone's data for a Manager", async () => {
    await seed();

    const res = await request(app)
      .get("/api/v1/dashboard/summary")
      .set("Authorization", `Bearer ${tokenFor("Manager")}`);

    expect(res.body.thumbnails_total).toBe(6);
    expect(res.body.reports_generated).toBe(3);
    expect(res.body.score_distribution[1].count).toBe(1);
  });

  it("returns empty metrics, with null lift, for a new user", async () => {
    const res = await request(app)
      .get("/api/v1/dashboard/summary")
      .set("Authorization", `Bearer ${tokenFor("Creator")}`);

    expect(res.body).toMatchObject({
      thumbnails_total: 0,
      thumbnails_scored: 0,
      active_tests: 0,
      avg_predicted_lift: null,
      prediction_accuracy: { correct: 0, total: 0 },
      reports_generated: 0,
    });
  });

  it("scores 100 into the top bin, not an 11th one", async () => {
    const creatorId = new mongoose.Types.ObjectId().toString();
    await thumbnail(creatorId, 100);

    const res = await request(app)
      .get("/api/v1/dashboard/summary")
      .set("Authorization", `Bearer ${tokenFor("Creator", creatorId)}`);

    expect(res.body.score_distribution).toHaveLength(10);
    expect(res.body.score_distribution[9].count).toBe(1);
  });

  it("requires a token", async () => {
    const res = await request(app).get("/api/v1/dashboard/summary");
    expect(res.status).toBe(401);
  });
});
