const mongoose = require("mongoose");
const request = require("supertest");
const { MongoMemoryServer } = require("mongodb-memory-server");

const app = require("../src/server");
const { tokenFor } = require("./helpers");

let mongod;

beforeAll(async () => {
  process.env.JWT_SECRET = "test-secret";
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

describe.each([
  ["POST", "/api/v1/thumbnails/upload"],
  ["POST", "/api/v1/predictions/analyze"],
  ["POST", "/api/v1/abtests"],
  ["PATCH", "/api/v1/abtests/000000000000000000000000/status"],
])("%s %s", (method, path) => {
  it("rejects requests with no token", async () => {
    const res = await request(app)[method.toLowerCase()](path);
    expect(res.status).toBe(401);
  });

  it("rejects requests with a garbage token", async () => {
    const res = await request(app)
      [method.toLowerCase()](path)
      .set("Authorization", "Bearer not-a-real-token");
    expect(res.status).toBe(401);
  });
});

describe("role enforcement", () => {
  it("allows a Creator to upload thumbnails", async () => {
    const res = await request(app)
      .post("/api/v1/thumbnails/upload")
      .set("Authorization", `Bearer ${await tokenFor("Creator")}`);
    expect(res.status).not.toBe(401);
    expect(res.status).not.toBe(403);
  });

  it("blocks a Creator from the admin API", async () => {
    const res = await request(app)
      .get("/api/v1/admin/users")
      .set("Authorization", `Bearer ${await tokenFor("Creator")}`);
    expect(res.status).toBe(403);
  });

  it("lets a Creator reach the close-test route (owner check happens there)", async () => {
    const res = await request(app)
      .patch("/api/v1/abtests/000000000000000000000000/status")
      .set("Authorization", `Bearer ${await tokenFor("Creator")}`);
    expect(res.status).not.toBe(401);
    expect(res.status).not.toBe(403);
  });

  it("allows a Manager to close an A/B test", async () => {
    const res = await request(app)
      .patch("/api/v1/abtests/000000000000000000000000/status")
      .set("Authorization", `Bearer ${await tokenFor("Manager")}`);
    expect(res.status).not.toBe(401);
    expect(res.status).not.toBe(403);
  });

  it("allows any authenticated role to trigger a prediction", async () => {
    const res = await request(app)
      .post("/api/v1/predictions/analyze")
      .set("Authorization", `Bearer ${await tokenFor("Creator")}`);
    expect(res.status).not.toBe(401);
    expect(res.status).not.toBe(403);
  });
});
