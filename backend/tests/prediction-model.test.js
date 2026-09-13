const mongoose = require("mongoose");
const { MongoMemoryServer } = require("mongodb-memory-server");

const Prediction = require("../src/models/Prediction");

let mongod;

beforeAll(async () => {
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

describe("Prediction model", () => {
  it("creates a prediction with defaults applied", async () => {
    const thumbnailId = new mongoose.Types.ObjectId();

    const prediction = await Prediction.create({
      thumbnail_id: thumbnailId,
      ctr_score: 78.4,
      rank: 1,
      explanation_signals: ["high-contrast text", "clear focal face"],
    });

    expect(prediction.thumbnail_id.toString()).toBe(thumbnailId.toString());
    expect(prediction.ctr_score).toBe(78.4);
    expect(prediction.scored_at).toBeInstanceOf(Date);
  });

  it("defaults explanation_signals to an empty array", async () => {
    const prediction = await Prediction.create({
      thumbnail_id: new mongoose.Types.ObjectId(),
      ctr_score: 50,
    });

    expect(prediction.explanation_signals).toEqual([]);
  });

  it("requires thumbnail_id and ctr_score", async () => {
    await expect(Prediction.create({})).rejects.toThrow();
  });

  it("rejects a ctr_score outside 0-100", async () => {
    await expect(
      Prediction.create({ thumbnail_id: new mongoose.Types.ObjectId(), ctr_score: 150 })
    ).rejects.toThrow();
  });
});
