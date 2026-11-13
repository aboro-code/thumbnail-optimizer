const fs = require("fs");
const os = require("os");
const path = require("path");

const testUploadDir = fs.mkdtempSync(path.join(os.tmpdir(), "thumbnail-uploads-"));
process.env.UPLOAD_DIR = testUploadDir;

const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");
const request = require("supertest");
const { MongoMemoryServer } = require("mongodb-memory-server");

const app = require("../src/server");
const Thumbnail = require("../src/models/Thumbnail");
const Prediction = require("../src/models/Prediction");

let mongod;

const JPEG_BUFFER = Buffer.concat([
  Buffer.from([0xff, 0xd8, 0xff, 0xe0]),
  Buffer.alloc(100, 0),
]);
const PNG_BUFFER = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.alloc(100, 0),
]);
const FAKE_EXE_AS_JPEG = Buffer.concat([Buffer.from("MZ"), Buffer.alloc(100, 0)]);

function tokenFor(role, sub = new mongoose.Types.ObjectId().toString()) {
  return jwt.sign({ sub, role }, process.env.JWT_SECRET, { expiresIn: "1h" });
}

function creatorToken() {
  return tokenFor("Creator");
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

describe("POST /api/v1/thumbnails/upload", () => {
  it("uploads a valid batch and creates thumbnail records", async () => {
    const res = await request(app)
      .post("/api/v1/thumbnails/upload")
      .set("Authorization", `Bearer ${creatorToken()}`)
      .field("content_title", "My Video")
      .field("target_platform", "YouTube")
      .attach("files", JPEG_BUFFER, { filename: "a.jpg", contentType: "image/jpeg" })
      .attach("files", PNG_BUFFER, { filename: "b.png", contentType: "image/png" });

    expect(res.status).toBe(201);
    expect(res.body.status).toBe("UPLOADED");
    expect(res.body.thumbnail_ids).toHaveLength(2);

    const saved = await Thumbnail.find({});
    expect(saved).toHaveLength(2);
    expect(saved[0].content_title).toBe("My Video");
    expect(saved[0].status).toBe("UPLOADED");
  });

  it("serves uploaded images from the configured UPLOAD_DIR", async () => {
    await request(app)
      .post("/api/v1/thumbnails/upload")
      .set("Authorization", `Bearer ${creatorToken()}`)
      .attach("files", JPEG_BUFFER, { filename: "a.jpg", contentType: "image/jpeg" })
      .attach("files", PNG_BUFFER, { filename: "b.png", contentType: "image/png" });

    const [saved] = await Thumbnail.find({});
    const res = await request(app).get(saved.image_url);

    expect(res.status).toBe(200);
  });

  it("rejects a batch with fewer than 2 files", async () => {
    const res = await request(app)
      .post("/api/v1/thumbnails/upload")
      .set("Authorization", `Bearer ${creatorToken()}`)
      .attach("files", JPEG_BUFFER, { filename: "a.jpg", contentType: "image/jpeg" });

    expect(res.status).toBe(400);
  });

  it("rejects a disguised executable renamed to .jpg (TEST-04)", async () => {
    const res = await request(app)
      .post("/api/v1/thumbnails/upload")
      .set("Authorization", `Bearer ${creatorToken()}`)
      .attach("files", FAKE_EXE_AS_JPEG, { filename: "virus.jpg", contentType: "image/jpeg" })
      .attach("files", JPEG_BUFFER, { filename: "b.jpg", contentType: "image/jpeg" });

    expect(res.status).toBe(400);

    const saved = await Thumbnail.find({});
    expect(saved).toHaveLength(0);
  });

  it("rejects an unsupported declared mime type", async () => {
    const res = await request(app)
      .post("/api/v1/thumbnails/upload")
      .set("Authorization", `Bearer ${creatorToken()}`)
      .attach("files", Buffer.from("<svg></svg>"), {
        filename: "a.svg",
        contentType: "image/svg+xml",
      })
      .attach("files", JPEG_BUFFER, { filename: "b.jpg", contentType: "image/jpeg" });

    expect(res.status).toBe(400);
  });

  it("rejects a file larger than 10MB", async () => {
    const oversized = Buffer.concat([
      Buffer.from([0xff, 0xd8, 0xff, 0xe0]),
      Buffer.alloc(10 * 1024 * 1024 + 1, 0),
    ]);

    const res = await request(app)
      .post("/api/v1/thumbnails/upload")
      .set("Authorization", `Bearer ${creatorToken()}`)
      .attach("files", oversized, { filename: "big.jpg", contentType: "image/jpeg" })
      .attach("files", JPEG_BUFFER, { filename: "b.jpg", contentType: "image/jpeg" });

    expect(res.status).toBe(400);
  }, 15000);
});

describe("GET /api/v1/thumbnails", () => {
  it("only returns the requesting Creator's own thumbnails", async () => {
    const ownerA = new mongoose.Types.ObjectId().toString();
    const ownerB = new mongoose.Types.ObjectId().toString();
    await Thumbnail.create({ user_id: ownerA, image_url: "/uploads/a.jpg" });
    await Thumbnail.create({ user_id: ownerB, image_url: "/uploads/b.jpg" });

    const res = await request(app)
      .get("/api/v1/thumbnails")
      .set("Authorization", `Bearer ${tokenFor("Creator", ownerA)}`);

    expect(res.status).toBe(200);
    expect(res.body.thumbnails).toHaveLength(1);
    expect(res.body.thumbnails[0].user_id).toBe(ownerA);
  });

  it("lets a Manager see thumbnails from every user", async () => {
    const ownerA = new mongoose.Types.ObjectId().toString();
    const ownerB = new mongoose.Types.ObjectId().toString();
    await Thumbnail.create({ user_id: ownerA, image_url: "/uploads/a.jpg" });
    await Thumbnail.create({ user_id: ownerB, image_url: "/uploads/b.jpg" });

    const res = await request(app)
      .get("/api/v1/thumbnails")
      .set("Authorization", `Bearer ${tokenFor("Manager")}`);

    expect(res.status).toBe(200);
    expect(res.body.thumbnails).toHaveLength(2);
  });

  it("includes each thumbnail's latest score, or null if never scored", async () => {
    const owner = new mongoose.Types.ObjectId().toString();
    const scored = await Thumbnail.create({ user_id: owner, image_url: "/uploads/a.jpg" });
    await Thumbnail.create({ user_id: owner, image_url: "/uploads/b.jpg" });
    await Prediction.create({ thumbnail_id: scored._id, ctr_score: 40, scored_at: new Date("2026-11-01") });
    await Prediction.create({ thumbnail_id: scored._id, ctr_score: 72.5, scored_at: new Date("2026-11-02") });

    const res = await request(app)
      .get("/api/v1/thumbnails")
      .set("Authorization", `Bearer ${tokenFor("Creator", owner)}`);

    const byId = Object.fromEntries(res.body.thumbnails.map((t) => [t._id, t.latest_ctr_score]));
    expect(byId[scored._id.toString()]).toBe(72.5);
    expect(Object.values(byId)).toContain(null);
  });

  it("filters by status", async () => {
    const owner = new mongoose.Types.ObjectId().toString();
    await Thumbnail.create({ user_id: owner, image_url: "/uploads/a.jpg", status: "UPLOADED" });
    await Thumbnail.create({ user_id: owner, image_url: "/uploads/b.jpg", status: "SCORED" });

    const res = await request(app)
      .get("/api/v1/thumbnails?status=SCORED")
      .set("Authorization", `Bearer ${tokenFor("Creator", owner)}`);

    expect(res.status).toBe(200);
    expect(res.body.thumbnails).toHaveLength(1);
    expect(res.body.thumbnails[0].status).toBe("SCORED");
  });

  it("rejects an invalid status filter", async () => {
    const res = await request(app)
      .get("/api/v1/thumbnails?status=NOT_A_STATUS")
      .set("Authorization", `Bearer ${creatorToken()}`);

    expect(res.status).toBe(400);
  });
});

describe("GET /api/v1/thumbnails/:id", () => {
  it("lets the owner fetch their own thumbnail", async () => {
    const owner = new mongoose.Types.ObjectId().toString();
    const thumb = await Thumbnail.create({ user_id: owner, image_url: "/uploads/a.jpg" });

    const res = await request(app)
      .get(`/api/v1/thumbnails/${thumb._id}`)
      .set("Authorization", `Bearer ${tokenFor("Creator", owner)}`);

    expect(res.status).toBe(200);
    expect(res.body._id).toBe(thumb._id.toString());
  });

  it("blocks a different Creator from fetching someone else's thumbnail", async () => {
    const owner = new mongoose.Types.ObjectId().toString();
    const thumb = await Thumbnail.create({ user_id: owner, image_url: "/uploads/a.jpg" });

    const res = await request(app)
      .get(`/api/v1/thumbnails/${thumb._id}`)
      .set("Authorization", `Bearer ${creatorToken()}`);

    expect(res.status).toBe(403);
  });

  it("lets a Manager fetch any thumbnail", async () => {
    const owner = new mongoose.Types.ObjectId().toString();
    const thumb = await Thumbnail.create({ user_id: owner, image_url: "/uploads/a.jpg" });

    const res = await request(app)
      .get(`/api/v1/thumbnails/${thumb._id}`)
      .set("Authorization", `Bearer ${tokenFor("Manager")}`);

    expect(res.status).toBe(200);
  });

  it("returns 404 for a well-formed but unknown id", async () => {
    const res = await request(app)
      .get(`/api/v1/thumbnails/${new mongoose.Types.ObjectId()}`)
      .set("Authorization", `Bearer ${creatorToken()}`);

    expect(res.status).toBe(404);
  });

  it("returns 400 for a malformed id", async () => {
    const res = await request(app)
      .get("/api/v1/thumbnails/not-an-id")
      .set("Authorization", `Bearer ${creatorToken()}`);

    expect(res.status).toBe(400);
  });
});
