const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");
const request = require("supertest");
const { MongoMemoryServer } = require("mongodb-memory-server");

const app = require("../src/server");
const User = require("../src/models/User");
const Thumbnail = require("../src/models/Thumbnail");
const Prediction = require("../src/models/Prediction");
const ABTest = require("../src/models/ABTest");

let mongod;

function tokenFor(role, sub = new mongoose.Types.ObjectId().toString()) {
  return jwt.sign({ sub, role }, process.env.JWT_SECRET, { expiresIn: "1h" });
}

function auth(role, id) {
  return { Authorization: `Bearer ${tokenFor(role, String(id))}` };
}

let counter = 0;
async function makeUser(role, extra = {}) {
  counter += 1;
  return User.create({ email: `${role.toLowerCase()}${counter}@example.com`, password_hash: "x", role, ...extra });
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

describe("Manager team scoping", () => {
  it("shows a Manager their own and their Creators' thumbnails, not other users'", async () => {
    const manager = await makeUser("Manager");
    const member = await makeUser("Creator", { manager_id: manager._id });
    const outsider = await makeUser("Creator");
    await Thumbnail.create({ user_id: manager._id, image_url: "/uploads/m.jpg" });
    await Thumbnail.create({ user_id: member._id, image_url: "/uploads/c.jpg" });
    const hidden = await Thumbnail.create({ user_id: outsider._id, image_url: "/uploads/o.jpg" });

    const list = await request(app).get("/api/v1/thumbnails").set(auth("Manager", manager._id));
    expect(list.status).toBe(200);
    expect(list.body.thumbnails.map((t) => t.image_url).sort()).toEqual(["/uploads/c.jpg", "/uploads/m.jpg"]);

    const direct = await request(app).get(`/api/v1/thumbnails/${hidden._id}`).set(auth("Manager", manager._id));
    expect(direct.status).toBe(403);
  });

  it("lets a Manager close a team member's test but not an outsider's", async () => {
    const manager = await makeUser("Manager");
    const member = await makeUser("Creator", { manager_id: manager._id });
    const outsider = await makeUser("Creator");

    async function runningTest(owner) {
      const a = await Thumbnail.create({ user_id: owner._id, image_url: "/uploads/a.jpg" });
      const b = await Thumbnail.create({ user_id: owner._id, image_url: "/uploads/b.jpg" });
      return ABTest.create({
        created_by: owner._id,
        content_reference: "ref",
        start_date: new Date("2026-09-05"),
        end_date: new Date("2026-09-12"),
        variants: [
          { thumbnail_id: a._id, impressions: 100, clicks: 5, measured_ctr: 0.05 },
          { thumbnail_id: b._id, impressions: 100, clicks: 9, measured_ctr: 0.09 },
        ],
      });
    }
    const teamTest = await runningTest(member);
    const otherTest = await runningTest(outsider);

    const ok = await request(app)
      .patch(`/api/v1/abtests/${teamTest._id}/status`)
      .set(auth("Manager", manager._id))
      .send({ status: "COMPLETED" });
    expect(ok.status).toBe(200);

    const denied = await request(app)
      .patch(`/api/v1/abtests/${otherTest._id}/status`)
      .set(auth("Manager", manager._id))
      .send({ status: "COMPLETED" });
    expect(denied.status).toBe(403);
  });

  it("scopes the dashboard summary to the team and says so", async () => {
    const manager = await makeUser("Manager");
    const member = await makeUser("Creator", { manager_id: manager._id });
    const outsider = await makeUser("Creator");
    await Thumbnail.create({ user_id: member._id, image_url: "/uploads/c.jpg" });
    await Thumbnail.create({ user_id: outsider._id, image_url: "/uploads/o.jpg" });

    const res = await request(app).get("/api/v1/dashboard/summary").set(auth("Manager", manager._id));
    expect(res.body.thumbnails_total).toBe(1);
    expect(res.body.scope).toBe("team");
  });
});

describe("/api/v1/team", () => {
  it("gives a Manager an invite code and lists their members", async () => {
    const manager = await makeUser("Manager");
    await makeUser("Creator", { manager_id: manager._id });

    const res = await request(app).get("/api/v1/team").set(auth("Manager", manager._id));
    expect(res.status).toBe(200);
    expect(res.body.invite_code).toMatch(/^[A-Z2-9]{8}$/);
    expect(res.body.members).toHaveLength(1);

    const again = await request(app).get("/api/v1/team").set(auth("Manager", manager._id));
    expect(again.body.invite_code).toBe(res.body.invite_code);
  });

  it("lets a Creator join with a code (case-insensitive) and leave again", async () => {
    const manager = await makeUser("Manager", { invite_code: "ABCD2345" });
    const creator = await makeUser("Creator");

    const join = await request(app)
      .post("/api/v1/team/join")
      .set(auth("Creator", creator._id))
      .send({ invite_code: " abcd2345 " });
    expect(join.status).toBe(200);
    expect(String((await User.findById(creator._id)).manager_id)).toBe(String(manager._id));

    const mine = await request(app).get("/api/v1/team").set(auth("Creator", creator._id));
    expect(mine.body.manager.email).toBe(manager.email);

    await request(app).post("/api/v1/team/leave").set(auth("Creator", creator._id)).expect(204);
    expect((await User.findById(creator._id)).manager_id).toBeNull();
  });

  it("rejects an unknown code and stops Managers from joining teams", async () => {
    const manager = await makeUser("Manager", { invite_code: "ABCD2345" });
    const creator = await makeUser("Creator");

    const bad = await request(app)
      .post("/api/v1/team/join")
      .set(auth("Creator", creator._id))
      .send({ invite_code: "NOPE0000" });
    expect(bad.status).toBe(400);

    const asManager = await request(app)
      .post("/api/v1/team/join")
      .set(auth("Manager", manager._id))
      .send({ invite_code: "ABCD2345" });
    expect(asManager.status).toBe(403);
  });

  it("regenerates the code and lets a Manager remove only their own members", async () => {
    const manager = await makeUser("Manager", { invite_code: "ABCD2345" });
    const member = await makeUser("Creator", { manager_id: manager._id });
    const outsider = await makeUser("Creator");

    const regen = await request(app).post("/api/v1/team/invite-code").set(auth("Manager", manager._id));
    expect(regen.body.invite_code).not.toBe("ABCD2345");

    await request(app).delete(`/api/v1/team/members/${outsider._id}`).set(auth("Manager", manager._id)).expect(404);
    await request(app).delete(`/api/v1/team/members/${member._id}`).set(auth("Manager", manager._id)).expect(204);
    expect((await User.findById(member._id)).manager_id).toBeNull();
  });
});

describe("signup with a team code", () => {
  it("puts the new Creator on the Manager's team", async () => {
    const manager = await makeUser("Manager", { invite_code: "TEAM2345" });

    const res = await request(app)
      .post("/api/v1/auth/signup")
      .send({ email: "new@example.com", password: "password123", role: "Creator", name: "New Person", invite_code: "TEAM2345" });

    expect(res.status).toBe(201);
    expect(String(res.body.user.manager_id)).toBe(String(manager._id));
    expect(res.body.user.name).toBe("New Person");
  });

  it("rejects a bad code without creating the account", async () => {
    const res = await request(app)
      .post("/api/v1/auth/signup")
      .send({ email: "new@example.com", password: "password123", invite_code: "BAD00000" });

    expect(res.status).toBe(400);
    expect(await User.countDocuments({ email: "new@example.com" })).toBe(0);
  });
});

describe("/api/v1/admin", () => {
  it("is Admin-only", async () => {
    const manager = await makeUser("Manager");
    await request(app).get("/api/v1/admin/users").set(auth("Manager", manager._id)).expect(403);
  });

  it("lists users with their manager and upload counts", async () => {
    const admin = await makeUser("Admin");
    const manager = await makeUser("Manager");
    const creator = await makeUser("Creator", { manager_id: manager._id });
    await Thumbnail.create({ user_id: creator._id, image_url: "/uploads/c.jpg" });

    const res = await request(app).get("/api/v1/admin/users").set(auth("Admin", admin._id));
    const row = res.body.users.find((u) => u.email === creator.email);
    expect(row.manager_email).toBe(manager.email);
    expect(row.thumbnails).toBe(1);
    expect(row.status).toBe("active");
  });

  it("assigns a Creator to a Manager and rejects non-Manager targets", async () => {
    const admin = await makeUser("Admin");
    const manager = await makeUser("Manager");
    const creator = await makeUser("Creator");
    const otherCreator = await makeUser("Creator");

    const ok = await request(app)
      .patch(`/api/v1/admin/users/${creator._id}`)
      .set(auth("Admin", admin._id))
      .send({ manager_id: String(manager._id) });
    expect(ok.status).toBe(200);
    expect(String(ok.body.manager_id)).toBe(String(manager._id));

    const bad = await request(app)
      .patch(`/api/v1/admin/users/${creator._id}`)
      .set(auth("Admin", admin._id))
      .send({ manager_id: String(otherCreator._id) });
    expect(bad.status).toBe(400);
  });

  it("asks what to do with a Manager's team before demoting them", async () => {
    const admin = await makeUser("Admin");
    const manager = await makeUser("Manager");
    await makeUser("Creator", { manager_id: manager._id });

    const res = await request(app)
      .patch(`/api/v1/admin/users/${manager._id}`)
      .set(auth("Admin", admin._id))
      .send({ role: "Creator" });
    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({ code: "TEAM_NOT_EMPTY", team_size: 1 });
    expect((await User.findById(manager._id)).role).toBe("Manager");
  });

  it("releases a demoted Manager's team when asked to", async () => {
    const admin = await makeUser("Admin");
    const manager = await makeUser("Manager");
    const creator = await makeUser("Creator", { manager_id: manager._id });

    await request(app)
      .patch(`/api/v1/admin/users/${manager._id}`)
      .set(auth("Admin", admin._id))
      .send({ role: "Creator", release_team: true })
      .expect(200);

    expect((await User.findById(creator._id)).manager_id).toBeNull();
    const demoted = await User.findById(manager._id);
    expect(String(demoted.role_changed_by)).toBe(String(admin._id));
  });

  it("moves a demoted Manager's team to another Manager", async () => {
    const admin = await makeUser("Admin");
    const manager = await makeUser("Manager");
    const other = await makeUser("Manager");
    const creator = await makeUser("Creator", { manager_id: manager._id });

    await request(app)
      .patch(`/api/v1/admin/users/${manager._id}`)
      .set(auth("Admin", admin._id))
      .send({ role: "Admin", reassign_to: String(other._id) })
      .expect(200);

    expect(String((await User.findById(creator._id)).manager_id)).toBe(String(other._id));
  });

  it("stops an Admin demoting or deactivating themselves", async () => {
    const admin = await makeUser("Admin");
    await request(app).patch(`/api/v1/admin/users/${admin._id}`).set(auth("Admin", admin._id)).send({ role: "Creator" }).expect(400);
    await request(app).patch(`/api/v1/admin/users/${admin._id}`).set(auth("Admin", admin._id)).send({ status: "deactivated" }).expect(400);
  });

  it("blocks sign-in for a deactivated account", async () => {
    const admin = await makeUser("Admin");
    await request(app).post("/api/v1/auth/signup").send({ email: "gone@example.com", password: "password123" }).expect(201);
    const user = await User.findOne({ email: "gone@example.com" });

    await request(app).patch(`/api/v1/admin/users/${user._id}`).set(auth("Admin", admin._id)).send({ status: "deactivated" }).expect(200);

    const login = await request(app).post("/api/v1/auth/login").send({ email: "gone@example.com", password: "password123" });
    expect(login.status).toBe(403);
  });

  it("returns system analytics", async () => {
    const admin = await makeUser("Admin");
    const creator = await makeUser("Creator");
    const t = await Thumbnail.create({ user_id: creator._id, image_url: "/uploads/c.jpg" });
    await Prediction.create({ thumbnail_id: t._id, ctr_score: 70 });

    const res = await request(app).get("/api/v1/admin/analytics").set(auth("Admin", admin._id));
    expect(res.status).toBe(200);
    expect(res.body.users.by_role).toEqual({ Creator: 1, Manager: 0, Admin: 1 });
    expect(res.body.thumbnails).toEqual({ total: 1, scored: 1, uploaded_last_7_days: 1 });
    expect(res.body.ab_tests).toEqual({ RUNNING: 0, COMPLETED: 0, CANCELLED: 0 });
  });

  it("reports the AI service as unreachable instead of failing", async () => {
    const admin = await makeUser("Admin");
    const previous = process.env.AI_SERVICE_URL;
    process.env.AI_SERVICE_URL = "http://127.0.0.1:1";
    try {
      const res = await request(app).get("/api/v1/admin/model-info").set(auth("Admin", admin._id));
      expect(res.status).toBe(200);
      expect(res.body.ai_service.reachable).toBe(false);
    } finally {
      process.env.AI_SERVICE_URL = previous;
    }
  });
});

describe("GET /api/v1/thumbnails/:id/batch", () => {
  it("returns the whole batch ranked by latest score, unscored items last", async () => {
    const creator = await makeUser("Creator");
    const a = await Thumbnail.create({ user_id: creator._id, image_url: "/uploads/a.jpg", batch_id: "b1" });
    const b = await Thumbnail.create({ user_id: creator._id, image_url: "/uploads/b.jpg", batch_id: "b1" });
    const c = await Thumbnail.create({ user_id: creator._id, image_url: "/uploads/c.jpg", batch_id: "b1" });
    await Thumbnail.create({ user_id: creator._id, image_url: "/uploads/other.jpg", batch_id: "b2" });
    await Prediction.create({ thumbnail_id: a._id, ctr_score: 40 });
    await Prediction.create({ thumbnail_id: b._id, ctr_score: 80, explanation_text: "bright" });

    const res = await request(app).get(`/api/v1/thumbnails/${c._id}/batch`).set(auth("Creator", creator._id));

    expect(res.status).toBe(200);
    expect(res.body.items.map((i) => i.image_url)).toEqual(["/uploads/b.jpg", "/uploads/a.jpg", "/uploads/c.jpg"]);
    expect(res.body.items[0].rank).toBe(1);
    expect(res.body.items[0].explanation_text).toBe("bright");
    expect(res.body.items[2].ctr_score).toBeNull();
    expect(res.body.all_scored).toBe(false);
  });

  it("groups older uploads without a batch id by upload time", async () => {
    const creator = await makeUser("Creator");
    const at = new Date("2026-10-01T10:00:00Z");
    const a = await Thumbnail.create({ user_id: creator._id, image_url: "/uploads/a.jpg", uploaded_at: at });
    await Thumbnail.create({ user_id: creator._id, image_url: "/uploads/b.jpg", uploaded_at: new Date(at.getTime() + 2000) });
    await Thumbnail.create({ user_id: creator._id, image_url: "/uploads/late.jpg", uploaded_at: new Date(at.getTime() + 3600000) });

    const res = await request(app).get(`/api/v1/thumbnails/${a._id}/batch`).set(auth("Creator", creator._id));
    expect(res.body.items).toHaveLength(2);
  });

  it("blocks other Creators", async () => {
    const owner = await makeUser("Creator");
    const other = await makeUser("Creator");
    const t = await Thumbnail.create({ user_id: owner._id, image_url: "/uploads/a.jpg", batch_id: "b1" });

    await request(app).get(`/api/v1/thumbnails/${t._id}/batch`).set(auth("Creator", other._id)).expect(403);
  });
});
