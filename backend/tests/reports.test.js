const fs = require("fs");
const os = require("os");
const path = require("path");

const testUploadDir = fs.mkdtempSync(path.join(os.tmpdir(), "thumbnail-uploads-"));
process.env.UPLOAD_DIR = testUploadDir;

const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");
const request = require("supertest");
const sharp = require("sharp");
const { MongoMemoryServer } = require("mongodb-memory-server");

const app = require("../src/server");
const Thumbnail = require("../src/models/Thumbnail");
const Prediction = require("../src/models/Prediction");
const ABTest = require("../src/models/ABTest");
const { csvCell } = require("../src/services/reportExport");

let mongod;

function tokenFor(role, sub = new mongoose.Types.ObjectId().toString()) {
  return jwt.sign({ sub, role }, process.env.JWT_SECRET, { expiresIn: "1h" });
}

function binaryParser(res, callback) {
  const chunks = [];
  res.on("data", (chunk) => chunks.push(chunk));
  res.on("end", () => callback(null, Buffer.concat(chunks)));
}

async function writeWebp(filename) {
  await sharp({ create: { width: 64, height: 36, channels: 3, background: "#e51f26" } })
    .webp()
    .toFile(path.join(testUploadDir, filename));
  return `/uploads/${filename}`;
}

// Two scored variants: A predicted higher, B with the better measured CTR.
async function createScoredTest(ownerId, { status = "COMPLETED", titleA = "Bold face" } = {}) {
  const a = await Thumbnail.create({
    user_id: ownerId,
    image_url: await writeWebp("a.webp"),
    content_title: titleA,
    status: "TESTING",
  });
  const b = await Thumbnail.create({ user_id: ownerId, image_url: "/uploads/missing.jpg", status: "TESTING" });
  await Prediction.create({
    thumbnail_id: a._id,
    ctr_score: 88.5,
    explanation_signals: ["high-contrast image", "clear focal face present"],
    explanation_text: "Strong contrast and a clear face.",
  });
  await Prediction.create({ thumbnail_id: b._id, ctr_score: 61.2, explanation_signals: ["muted colors"] });

  const test = await ABTest.create({
    created_by: ownerId,
    content_reference: "youtube.com/watch?v=abc123",
    status,
    start_date: new Date("2026-09-05"),
    end_date: new Date("2026-09-12"),
    variants: [
      { thumbnail_id: a._id, impressions: 1000, clicks: 50, measured_ctr: 0.05 },
      { thumbnail_id: b._id, impressions: 1000, clicks: 80, measured_ctr: 0.08 },
    ],
  });
  if (status === "COMPLETED") {
    test.winner_variant_id = test.variants[1]._id;
    await test.save();
  }
  return test;
}

function parseCsv(text) {
  const [header, ...rows] = text.replace(String.fromCharCode(0xfeff), "").trim().split(/\r\n/);
  const columns = header.split(",");
  return rows.map((row) => Object.fromEntries(row.split(",").map((cell, i) => [columns[i], cell])));
}

beforeAll(async () => {
  process.env.JWT_SECRET = "test-secret";
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
  fs.rmSync(testUploadDir, { recursive: true, force: true });
});

afterEach(async () => {
  await mongoose.connection.db.dropDatabase();
});

describe("GET /api/v1/reports/:abTestId/export?format=csv", () => {
  it("exports one row per variant with predictions, results and the prediction check", async () => {
    const ownerId = new mongoose.Types.ObjectId().toString();
    const test = await createScoredTest(ownerId);

    const res = await request(app)
      .get(`/api/v1/reports/${test._id}/export?format=csv`)
      .set("Authorization", `Bearer ${tokenFor("Creator", ownerId)}`);

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toMatch(/text\/csv/);
    expect(res.headers["content-disposition"]).toBe(`attachment; filename="abtest-${test._id}.csv"`);
    expect(res.text.charCodeAt(0)).toBe(0xfeff);
    expect(res.text.slice(1).startsWith("ab_test_id,content_reference,")).toBe(true);

    const rows = parseCsv(res.text);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      variant: "Variant A",
      thumbnail_title: "Bold face",
      predicted_ctr_score: "88.5",
      predicted_rank: "1",
      impressions: "1000",
      clicks: "50",
      measured_ctr: "0.05",
      is_winner: "false",
      is_predicted_winner: "true",
      prediction_matched_winner: "false",
      explanation_signals: "high-contrast image; clear focal face present",
    });
    expect(rows[1]).toMatchObject({ variant: "Variant B", predicted_rank: "2", is_winner: "true" });
  });

  it("leaves winner and prediction check empty for a running test", async () => {
    const ownerId = new mongoose.Types.ObjectId().toString();
    const test = await createScoredTest(ownerId, { status: "RUNNING" });

    const res = await request(app)
      .get(`/api/v1/reports/${test._id}/export?format=csv`)
      .set("Authorization", `Bearer ${tokenFor("Creator", ownerId)}`);

    const rows = parseCsv(res.text);
    expect(rows.every((r) => r.is_winner === "false")).toBe(true);
    expect(rows[0].prediction_matched_winner).toBe("");
  });

  it("neutralises spreadsheet formulas in user-supplied text", async () => {
    const ownerId = new mongoose.Types.ObjectId().toString();
    const test = await createScoredTest(ownerId, { titleA: '=HYPERLINK("http://evil.example")' });

    const res = await request(app)
      .get(`/api/v1/reports/${test._id}/export?format=csv`)
      .set("Authorization", `Bearer ${tokenFor("Creator", ownerId)}`);

    expect(res.text).toContain(`"'=HYPERLINK(""http://evil.example"")"`);
  });
});

describe("GET /api/v1/reports/:abTestId/export?format=pdf", () => {
  it("returns a PDF with the thumbnail image embedded, even when another image is missing", async () => {
    const ownerId = new mongoose.Types.ObjectId().toString();
    const test = await createScoredTest(ownerId);

    const res = await request(app)
      .get(`/api/v1/reports/${test._id}/export?format=pdf`)
      .set("Authorization", `Bearer ${tokenFor("Creator", ownerId)}`)
      .buffer(true)
      .parse(binaryParser);

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toBe("application/pdf");
    expect(res.body.subarray(0, 5).toString()).toBe("%PDF-");
    expect(res.body.toString("latin1")).toContain("/Subtype /Image");
  });

  it("defaults to PDF when no format is given", async () => {
    const ownerId = new mongoose.Types.ObjectId().toString();
    const test = await createScoredTest(ownerId);

    const res = await request(app)
      .get(`/api/v1/reports/${test._id}/export`)
      .set("Authorization", `Bearer ${tokenFor("Creator", ownerId)}`)
      .buffer(true)
      .parse(binaryParser);

    expect(res.headers["content-type"]).toBe("application/pdf");
  });
});

describe("report export access", () => {
  it("rejects an unknown format", async () => {
    const ownerId = new mongoose.Types.ObjectId().toString();
    const test = await createScoredTest(ownerId);

    const res = await request(app)
      .get(`/api/v1/reports/${test._id}/export?format=xlsx`)
      .set("Authorization", `Bearer ${tokenFor("Creator", ownerId)}`);

    expect(res.status).toBe(400);
  });

  it("requires a token", async () => {
    const res = await request(app).get(`/api/v1/reports/${new mongoose.Types.ObjectId()}/export?format=csv`);
    expect(res.status).toBe(401);
  });

  it("forbids a Creator from exporting someone else's test", async () => {
    const test = await createScoredTest(new mongoose.Types.ObjectId().toString());

    const res = await request(app)
      .get(`/api/v1/reports/${test._id}/export?format=csv`)
      .set("Authorization", `Bearer ${tokenFor("Creator")}`);

    expect(res.status).toBe(403);
  });

  it("lets a Manager export any test", async () => {
    const test = await createScoredTest(new mongoose.Types.ObjectId().toString());

    const res = await request(app)
      .get(`/api/v1/reports/${test._id}/export?format=csv`)
      .set("Authorization", `Bearer ${tokenFor("Manager")}`);

    expect(res.status).toBe(200);
  });

  it("returns 404 for a missing test and 400 for an invalid id", async () => {
    const token = tokenFor("Admin");
    const missing = await request(app)
      .get(`/api/v1/reports/${new mongoose.Types.ObjectId()}/export?format=csv`)
      .set("Authorization", `Bearer ${token}`);
    const invalid = await request(app)
      .get("/api/v1/reports/not-an-id/export?format=csv")
      .set("Authorization", `Bearer ${token}`);

    expect(missing.status).toBe(404);
    expect(invalid.status).toBe(400);
  });
});

describe("GET /api/v1/reports (export history)", () => {
  it("logs each export and lists the user's own history, newest first", async () => {
    const ownerId = new mongoose.Types.ObjectId().toString();
    const test = await createScoredTest(ownerId);
    const token = tokenFor("Creator", ownerId);

    await request(app).get(`/api/v1/reports/${test._id}/export?format=csv`).set("Authorization", `Bearer ${token}`);
    await request(app)
      .get(`/api/v1/reports/${test._id}/export?format=pdf`)
      .set("Authorization", `Bearer ${token}`)
      .buffer(true)
      .parse(binaryParser);

    const res = await request(app).get("/api/v1/reports").set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.reports.map((r) => r.format)).toEqual(["pdf", "csv"]);
    expect(res.body.reports[0].ab_test).toMatchObject({
      _id: test._id.toString(),
      content_reference: "youtube.com/watch?v=abc123",
      status: "COMPLETED",
    });
  });

  it("does not log a rejected export", async () => {
    const ownerId = new mongoose.Types.ObjectId().toString();
    const test = await createScoredTest(ownerId);

    await request(app)
      .get(`/api/v1/reports/${test._id}/export?format=csv`)
      .set("Authorization", `Bearer ${tokenFor("Creator")}`);

    const res = await request(app)
      .get("/api/v1/reports")
      .set("Authorization", `Bearer ${tokenFor("Manager")}`);
    expect(res.body.reports).toHaveLength(0);
  });

  it("hides other users' exports from a Creator but shows them to a Manager", async () => {
    const ownerId = new mongoose.Types.ObjectId().toString();
    const test = await createScoredTest(ownerId);
    await request(app)
      .get(`/api/v1/reports/${test._id}/export?format=csv`)
      .set("Authorization", `Bearer ${tokenFor("Creator", ownerId)}`);

    const other = await request(app).get("/api/v1/reports").set("Authorization", `Bearer ${tokenFor("Creator")}`);
    const manager = await request(app).get("/api/v1/reports").set("Authorization", `Bearer ${tokenFor("Manager")}`);

    expect(other.body.reports).toHaveLength(0);
    expect(manager.body.reports).toHaveLength(1);
  });
});

describe("csvCell", () => {
  it("quotes commas, quotes and newlines", () => {
    expect(csvCell('a, "b"\nc')).toBe('"a, ""b""\nc"');
  });

  it("leaves numbers alone, including negatives", () => {
    expect(csvCell(-1.5)).toBe("-1.5");
    expect(csvCell("-1.5")).toBe("'-1.5");
  });

  it("writes null as an empty cell and dates as ISO", () => {
    expect(csvCell(null)).toBe("");
    expect(csvCell(new Date("2026-09-05T00:00:00Z"))).toBe("2026-09-05T00:00:00.000Z");
  });
});
