const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");
const request = require("supertest");
const bcrypt = require("bcryptjs");
const { MongoMemoryServer } = require("mongodb-memory-server");

jest.mock("../src/services/googleAuth", () => ({
  verifyGoogleCredential: jest.fn(),
}));

const { verifyGoogleCredential } = require("../src/services/googleAuth");
const app = require("../src/server");
const User = require("../src/models/User");

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
  jest.clearAllMocks();
  await mongoose.connection.db.dropDatabase();
});

function googleProfile(overrides = {}) {
  return {
    googleId: "google-123",
    email: "new.user@gmail.com",
    emailVerified: true,
    name: "New User",
    ...overrides,
  };
}

describe("POST /api/v1/auth/google", () => {
  it("creates a new account that still needs its profile", async () => {
    verifyGoogleCredential.mockResolvedValue(googleProfile());

    const res = await request(app).post("/api/v1/auth/google").send({ credential: "fake-token" });

    expect(res.status).toBe(200);
    expect(res.body.needs_profile).toBe(true);
    expect(res.body.token).toBeDefined();

    const saved = await User.findOne({ email: "new.user@gmail.com" });
    expect(saved.google_id).toBe("google-123");
    expect(saved.profile_complete).toBe(false);
    expect(saved.password_hash).toBeUndefined();
  });

  it("merges into an existing email/password account instead of creating a duplicate", async () => {
    const hash = await bcrypt.hash("password123", 4);
    await User.create({ email: "merge@gmail.com", password_hash: hash, role: "Creator" });
    verifyGoogleCredential.mockResolvedValue(googleProfile({ email: "merge@gmail.com", googleId: "google-456" }));

    const res = await request(app).post("/api/v1/auth/google").send({ credential: "fake-token" });

    expect(res.status).toBe(200);
    expect(res.body.needs_profile).toBe(false);
    expect(await User.countDocuments({ email: "merge@gmail.com" })).toBe(1);

    const merged = await User.findOne({ email: "merge@gmail.com" });
    expect(merged.google_id).toBe("google-456");
  });

  it("signs a returning Google user straight in", async () => {
    await User.create({
      email: "returning@gmail.com",
      google_id: "google-789",
      profile_complete: true,
      role: "Manager",
    });
    verifyGoogleCredential.mockResolvedValue(googleProfile({ email: "returning@gmail.com", googleId: "google-789" }));

    const res = await request(app).post("/api/v1/auth/google").send({ credential: "fake-token" });

    expect(res.status).toBe(200);
    expect(res.body.needs_profile).toBe(false);
    expect(res.body.user.role).toBe("Manager");
  });

  it("rejects an unverified Google email", async () => {
    verifyGoogleCredential.mockResolvedValue(googleProfile({ emailVerified: false }));

    const res = await request(app).post("/api/v1/auth/google").send({ credential: "fake-token" });

    expect(res.status).toBe(401);
  });

  it("rejects a credential Google cannot verify", async () => {
    verifyGoogleCredential.mockRejectedValue(new Error("Invalid token signature"));

    const res = await request(app).post("/api/v1/auth/google").send({ credential: "forged" });

    expect(res.status).toBe(401);
  });

  it("requires a credential", async () => {
    const res = await request(app).post("/api/v1/auth/google").send({});

    expect(res.status).toBe(400);
  });

  it("refuses to link a Google account onto an email already tied to a different Google account", async () => {
    await User.create({ email: "taken@gmail.com", google_id: "someone-else", profile_complete: true });
    verifyGoogleCredential.mockResolvedValue(googleProfile({ email: "taken@gmail.com", googleId: "attacker" }));

    const res = await request(app).post("/api/v1/auth/google").send({ credential: "fake-token" });

    expect(res.status).toBe(409);
  });

  it("gives a Google-only account a 401 on password login instead of a server error", async () => {
    await User.create({ email: "google-only@gmail.com", google_id: "google-999", profile_complete: true });

    const res = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: "google-only@gmail.com", password: "anything" });

    expect(res.status).toBe(401);
  });
});

describe("PATCH /api/v1/auth/profile", () => {
  async function newGoogleUser() {
    const user = await User.create({
      email: "profile@gmail.com",
      google_id: "google-profile",
      profile_complete: false,
    });
    const token = jwt.sign({ sub: user._id.toString(), role: user.role }, process.env.JWT_SECRET);
    return { user, token };
  }

  it("completes a new account with a name and role", async () => {
    const { user, token } = await newGoogleUser();

    const res = await request(app)
      .patch("/api/v1/auth/profile")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "  Priya Sharma ", role: "Manager" });

    expect(res.status).toBe(200);
    expect(res.body.needs_profile).toBe(false);
    expect(res.body.user.name).toBe("Priya Sharma");

    const saved = await User.findById(user._id);
    expect(saved.profile_complete).toBe(true);
    expect(saved.role).toBe("Manager");
  });

  it("does not let a new account pick Admin", async () => {
    const { token } = await newGoogleUser();

    const res = await request(app)
      .patch("/api/v1/auth/profile")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Sneaky", role: "Admin" });

    expect(res.status).toBe(400);
  });

  it("cannot be used to change the role of a finished account", async () => {
    const { token } = await newGoogleUser();
    await request(app)
      .patch("/api/v1/auth/profile")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "First Time", role: "Creator" });

    const res = await request(app)
      .patch("/api/v1/auth/profile")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Second Time", role: "Manager" });

    expect(res.status).toBe(403);
  });

  it("requires sign-in", async () => {
    const res = await request(app).patch("/api/v1/auth/profile").send({ name: "Anon", role: "Creator" });

    expect(res.status).toBe(401);
  });
});
