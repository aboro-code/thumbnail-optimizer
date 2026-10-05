const mongoose = require("mongoose");
const request = require("supertest");
const bcrypt = require("bcryptjs");
const { MongoMemoryServer } = require("mongodb-memory-server");

const app = require("../src/server");
const User = require("../src/models/User");
const { createAdmin } = require("../scripts/create-admin");

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

describe("public signup roles", () => {
  it("accepts Creator", async () => {
    const res = await request(app)
      .post("/api/v1/auth/signup")
      .send({ email: "c@example.com", password: "password123", role: "Creator" });
    expect(res.status).toBe(201);
  });

  it("accepts Manager", async () => {
    const res = await request(app)
      .post("/api/v1/auth/signup")
      .send({ email: "m@example.com", password: "password123", role: "Manager" });
    expect(res.status).toBe(201);
  });

  it("rejects Admin, so nobody can self-assign admin rights", async () => {
    const res = await request(app)
      .post("/api/v1/auth/signup")
      .send({ email: "evil@example.com", password: "password123", role: "Admin" });

    expect(res.status).toBe(400);
    expect(await User.countDocuments({ email: "evil@example.com" })).toBe(0);
  });
});

describe("createAdmin script", () => {
  it("creates a new admin with a hashed password", async () => {
    const { user, created } = await createAdmin({ email: "Root@Example.com", password: "adminpass1" });

    expect(created).toBe(true);
    expect(user.role).toBe("Admin");
    expect(user.email).toBe("root@example.com");
    expect(await bcrypt.compare("adminpass1", user.password_hash)).toBe(true);
  });

  it("promotes an existing account without changing its password", async () => {
    const hash = await bcrypt.hash("original-pass", 4);
    await User.create({ email: "existing@example.com", password_hash: hash, role: "Creator" });

    const { user, created } = await createAdmin({ email: "existing@example.com" });

    expect(created).toBe(false);
    expect(user.role).toBe("Admin");
    expect(await bcrypt.compare("original-pass", user.password_hash)).toBe(true);
  });

  it("rejects a short password for a new account", async () => {
    await expect(createAdmin({ email: "short@example.com", password: "abc" })).rejects.toThrow(
      /at least 8/
    );
  });

  it("rejects an invalid email", async () => {
    await expect(createAdmin({ email: "not-an-email", password: "adminpass1" })).rejects.toThrow(
      /valid email/
    );
  });
});
