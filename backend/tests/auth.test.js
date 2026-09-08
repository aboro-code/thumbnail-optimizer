const mongoose = require("mongoose");
const request = require("supertest");
const { MongoMemoryServer } = require("mongodb-memory-server");

const app = require("../src/server");

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

afterEach(async () => {
  await mongoose.connection.db.dropDatabase();
});

describe("POST /api/v1/auth/signup", () => {
  it("creates a new user and returns a token", async () => {
    const res = await request(app).post("/api/v1/auth/signup").send({
      email: "creator@example.com",
      password: "password123",
    });

    expect(res.status).toBe(201);
    expect(res.body.token).toBeDefined();
    expect(res.body.user).toMatchObject({ email: "creator@example.com", role: "Creator" });
  });

  it("rejects a duplicate email", async () => {
    await request(app)
      .post("/api/v1/auth/signup")
      .send({ email: "dup@example.com", password: "password123" });

    const res = await request(app)
      .post("/api/v1/auth/signup")
      .send({ email: "dup@example.com", password: "password123" });

    expect(res.status).toBe(409);
  });

  it("rejects an invalid email", async () => {
    const res = await request(app)
      .post("/api/v1/auth/signup")
      .send({ email: "not-an-email", password: "password123" });

    expect(res.status).toBe(400);
  });

  it("rejects a short password", async () => {
    const res = await request(app)
      .post("/api/v1/auth/signup")
      .send({ email: "short@example.com", password: "abc" });

    expect(res.status).toBe(400);
  });
});

describe("POST /api/v1/auth/login", () => {
  beforeEach(async () => {
    await request(app)
      .post("/api/v1/auth/signup")
      .send({ email: "login@example.com", password: "password123" });
  });

  it("logs in with correct credentials", async () => {
    const res = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: "login@example.com", password: "password123" });

    expect(res.status).toBe(200);
    expect(res.body.token).toBeDefined();
  });

  it("rejects an incorrect password", async () => {
    const res = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: "login@example.com", password: "wrongpassword" });

    expect(res.status).toBe(401);
  });

  it("rejects an unknown email", async () => {
    const res = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: "nobody@example.com", password: "password123" });

    expect(res.status).toBe(401);
  });
});
