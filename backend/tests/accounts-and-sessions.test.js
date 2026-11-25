const mongoose = require("mongoose");
const request = require("supertest");
const { MongoMemoryServer } = require("mongodb-memory-server");

const app = require("../src/server");
const User = require("../src/models/User");
const Thumbnail = require("../src/models/Thumbnail");
const Prediction = require("../src/models/Prediction");
const ABTest = require("../src/models/ABTest");
const RefreshToken = require("../src/models/RefreshToken");
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

afterEach(async () => {
  await mongoose.connection.db.dropDatabase();
});

const bearer = (token) => ({ Authorization: `Bearer ${token}` });

async function signup(email, extra = {}) {
  const res = await request(app)
    .post("/api/v1/auth/signup")
    .send({ email, password: "password123", ...extra })
    .expect(201);
  return { token: res.body.token, user: res.body.user, cookie: res.headers["set-cookie"] };
}

function refreshCookie(setCookie) {
  return setCookie.find((c) => c.startsWith("refresh_token=")).split(";")[0];
}

describe("live role and status (D-42)", () => {
  it("applies a role change on the next request, without signing in again", async () => {
    const { token, user } = await signup("live@example.com");
    await request(app).get("/api/v1/admin/users").set(bearer(token)).expect(403);

    await User.updateOne({ _id: user.id }, { $set: { role: "Admin" } });
    await request(app).get("/api/v1/admin/users").set(bearer(token)).expect(200);
  });

  it("locks out a deactivated user straight away, with a code the UI can use", async () => {
    const { token, user } = await signup("off@example.com");
    await User.updateOne({ _id: user.id }, { $set: { status: "deactivated" } });

    const res = await request(app).get("/api/v1/thumbnails").set(bearer(token));
    expect(res.status).toBe(403);
    expect(res.body.code).toBe("ACCOUNT_DEACTIVATED");
  });

  it("rejects the token of a deleted user", async () => {
    const { token, user } = await signup("deleted@example.com");
    await User.deleteOne({ _id: user.id });

    const res = await request(app).get("/api/v1/thumbnails").set(bearer(token));
    expect(res.status).toBe(401);
    expect(res.body.code).toBe("ACCOUNT_DELETED");
  });

  it("GET /auth/me returns the role as stored now", async () => {
    const { token, user } = await signup("me@example.com");
    await User.updateOne({ _id: user.id }, { $set: { role: "Manager" } });

    const res = await request(app).get("/api/v1/auth/me").set(bearer(token)).expect(200);
    expect(res.body.user.role).toBe("Manager");
  });
});

describe("refresh tokens (PRD §10.1)", () => {
  it("sets an httpOnly refresh cookie at sign-up and swaps it for a new access token", async () => {
    const { cookie } = await signup("refresh@example.com");
    expect(cookie.join(";")).toMatch(/HttpOnly/i);

    const res = await request(app).post("/api/v1/auth/refresh").set("Cookie", refreshCookie(cookie)).expect(200);
    expect(res.body.token).toEqual(expect.any(String));
    expect(res.body.user.email).toBe("refresh@example.com");
  });

  it("rotates: a refresh token works only once", async () => {
    const { cookie } = await signup("rotate@example.com");
    const first = refreshCookie(cookie);
    await request(app).post("/api/v1/auth/refresh").set("Cookie", first).expect(200);
    await request(app).post("/api/v1/auth/refresh").set("Cookie", first).expect(401);
  });

  it("refuses to refresh a deactivated account", async () => {
    const { cookie, user } = await signup("norefresh@example.com");
    await User.updateOne({ _id: user.id }, { $set: { status: "deactivated" } });
    const res = await request(app).post("/api/v1/auth/refresh").set("Cookie", refreshCookie(cookie));
    expect(res.status).toBe(403);
  });

  it("logout ends the session", async () => {
    const { cookie } = await signup("bye@example.com");
    const c = refreshCookie(cookie);
    await request(app).post("/api/v1/auth/logout").set("Cookie", c).expect(204);
    await request(app).post("/api/v1/auth/refresh").set("Cookie", c).expect(401);
  });
});

describe("deleting accounts (D-45)", () => {
  async function seedData(userId) {
    const a = await Thumbnail.create({ user_id: userId, image_url: "/uploads/missing-a.jpg" });
    const b = await Thumbnail.create({ user_id: userId, image_url: "/uploads/missing-b.jpg" });
    await Prediction.create({ thumbnail_id: a._id, ctr_score: 60 });
    await ABTest.create({
      created_by: userId,
      content_reference: "video",
      start_date: new Date(),
      end_date: new Date(Date.now() + 86400000),
      variants: [{ thumbnail_id: a._id }, { thumbnail_id: b._id }],
    });
  }

  it("lets a Creator delete their own account with their password, removing their data", async () => {
    const { token, user } = await signup("self@example.com");
    await seedData(user.id);

    const summary = await request(app).get("/api/v1/auth/me/summary").set(bearer(token)).expect(200);
    expect(summary.body).toMatchObject({ thumbnails: 2, ab_tests: 1 });

    await request(app).delete("/api/v1/auth/me").set(bearer(token)).send({ password: "wrong-pass" }).expect(401);
    await request(app).delete("/api/v1/auth/me").set(bearer(token)).send({ password: "password123" }).expect(200);

    expect(await User.countDocuments({ _id: user.id })).toBe(0);
    expect(await Thumbnail.countDocuments()).toBe(0);
    expect(await Prediction.countDocuments()).toBe(0);
    expect(await ABTest.countDocuments()).toBe(0);
    expect(await RefreshToken.countDocuments({ user_id: user.id })).toBe(0);
  });

  it("releases a Manager's team when the Manager deletes their account, keeping the creators' tests", async () => {
    const manager = await signup("mgr@example.com", { role: "Manager" });
    const creator = await User.create({ email: "c@example.com", password_hash: "x", manager_id: manager.user.id });
    const a = await Thumbnail.create({ user_id: creator._id, image_url: "/uploads/x.jpg" });
    const b = await Thumbnail.create({ user_id: creator._id, image_url: "/uploads/y.jpg" });

    // The Manager starts a test on the creator's thumbnails: the creator owns it.
    const created = await request(app)
      .post("/api/v1/abtests")
      .set(bearer(manager.token))
      .send({
        content_reference: "creator video",
        variant_thumbnail_ids: [String(a._id), String(b._id)],
        start_date: new Date().toISOString(),
        end_date: new Date(Date.now() + 86400000).toISOString(),
      })
      .expect(201);

    await request(app).delete("/api/v1/auth/me").set(bearer(manager.token)).send({ password: "password123" }).expect(200);

    expect((await User.findById(creator._id)).manager_id).toBeNull();
    const test = await ABTest.findById(created.body.ab_test_id);
    expect(String(test.owner_id)).toBe(String(creator._id));
  });

  it("doesn't let an Admin delete their own account", async () => {
    const admin = await User.create({ email: "a@example.com", password_hash: "x", role: "Admin" });
    const token = await tokenFor("Admin", String(admin._id));
    await request(app).delete("/api/v1/auth/me").set(bearer(token)).send({ password: "x" }).expect(403);
  });

  it("lets an Admin delete a Creator but not another Admin", async () => {
    const adminToken = await tokenFor("Admin");
    const creator = await User.create({ email: "gone@example.com", password_hash: "x" });
    const otherAdmin = await User.create({ email: "admin2@example.com", password_hash: "x", role: "Admin" });
    await seedData(creator._id);

    const summary = await request(app).get(`/api/v1/admin/users/${creator._id}/summary`).set(bearer(adminToken)).expect(200);
    expect(summary.body.thumbnails).toBe(2);

    await request(app).delete(`/api/v1/admin/users/${otherAdmin._id}`).set(bearer(adminToken)).expect(403);
    await request(app).delete(`/api/v1/admin/users/${creator._id}`).set(bearer(adminToken)).expect(200);
    expect(await User.countDocuments({ _id: creator._id })).toBe(0);
    expect(await Thumbnail.countDocuments()).toBe(0);
  });
});

describe("A/B test ownership and closing (D-43, D-44)", () => {
  async function makeTest(token, thumbs) {
    return request(app)
      .post("/api/v1/abtests")
      .set(bearer(token))
      .send({
        content_reference: "video",
        variant_thumbnail_ids: thumbs.map((t) => String(t._id)),
        start_date: new Date().toISOString(),
        end_date: new Date(Date.now() + 86400000).toISOString(),
      });
  }

  it("rejects a test that mixes two people's thumbnails", async () => {
    const manager = await signup("mix@example.com", { role: "Manager" });
    const c1 = await User.create({ email: "c1@example.com", password_hash: "x", manager_id: manager.user.id });
    const c2 = await User.create({ email: "c2@example.com", password_hash: "x", manager_id: manager.user.id });
    const a = await Thumbnail.create({ user_id: c1._id, image_url: "/uploads/a.jpg" });
    const b = await Thumbnail.create({ user_id: c2._id, image_url: "/uploads/b.jpg" });

    const res = await makeTest(manager.token, [a, b]);
    expect(res.status).toBe(400);
  });

  it("lets a Creator close their own test, but not someone else's", async () => {
    const owner = await signup("owner@example.com");
    const stranger = await signup("stranger@example.com");
    const a = await Thumbnail.create({ user_id: owner.user.id, image_url: "/uploads/a.jpg" });
    const b = await Thumbnail.create({ user_id: owner.user.id, image_url: "/uploads/b.jpg" });
    const created = await makeTest(owner.token, [a, b]).then((r) => r.body);

    await request(app)
      .patch(`/api/v1/abtests/${created.ab_test_id}/status`)
      .set(bearer(stranger.token))
      .send({ status: "COMPLETED" })
      .expect(403);
    await request(app)
      .patch(`/api/v1/abtests/${created.ab_test_id}/status`)
      .set(bearer(owner.token))
      .send({ status: "COMPLETED" })
      .expect(200);
  });
});
