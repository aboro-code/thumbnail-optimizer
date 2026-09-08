const jwt = require("jsonwebtoken");
const request = require("supertest");

const app = require("../src/server");

beforeAll(() => {
  process.env.JWT_SECRET = "test-secret";
});

function tokenFor(role) {
  return jwt.sign({ sub: "000000000000000000000000", role }, process.env.JWT_SECRET, {
    expiresIn: "1h",
  });
}

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
      .set("Authorization", `Bearer ${tokenFor("Creator")}`);
    expect(res.status).not.toBe(401);
    expect(res.status).not.toBe(403);
  });

  it("blocks a Creator from closing an A/B test", async () => {
    const res = await request(app)
      .patch("/api/v1/abtests/000000000000000000000000/status")
      .set("Authorization", `Bearer ${tokenFor("Creator")}`);
    expect(res.status).toBe(403);
  });

  it("allows a Manager to close an A/B test", async () => {
    const res = await request(app)
      .patch("/api/v1/abtests/000000000000000000000000/status")
      .set("Authorization", `Bearer ${tokenFor("Manager")}`);
    expect(res.status).not.toBe(401);
    expect(res.status).not.toBe(403);
  });

  it("allows any authenticated role to trigger a prediction", async () => {
    const res = await request(app)
      .post("/api/v1/predictions/analyze")
      .set("Authorization", `Bearer ${tokenFor("Creator")}`);
    expect(res.status).not.toBe(401);
    expect(res.status).not.toBe(403);
  });
});
