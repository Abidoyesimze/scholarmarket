import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import jwt from "jsonwebtoken";
import { MongoMemoryServer } from "mongodb-memory-server";

let mongo;
let tokenService;

before(async () => {
  mongo = await MongoMemoryServer.create();
  process.env.MONGODB_URI = mongo.getUri();
  process.env.MONGODB_DB = "scholarmarket_token_test";
  process.env.JWT_SECRET = "token-service-test-secret";
  tokenService = await import("../../src/lib/auth/tokenService.js");
});

after(async () => {
  if (globalThis._mongoClientPromise) {
    try {
      const client = await globalThis._mongoClientPromise;
      await client.close();
      globalThis._mongoClientPromise = null;
    } catch {}
  }
  if (mongo) await mongo.stop();
});

test("generateAccessToken includes subject and 15-minute expiry", () => {
  const before = Math.floor(Date.now() / 1000);
  const token = tokenService.generateAccessToken({
    sub: "user-123",
    walletAddress: "GTEST",
    role: "learner",
  });
  const payload = jwt.verify(token, process.env.JWT_SECRET);

  assert.equal(payload.sub, "user-123");
  assert.equal(payload.walletAddress, "GTEST");
  assert.equal(payload.role, "learner");
  assert.ok(payload.exp - payload.iat >= 899);
  assert.ok(payload.exp - payload.iat <= 901);
  assert.ok(payload.iat >= before);
});

test("rotation issues a new token in the same family and consumes the old token", async () => {
  const familyId = await tokenService.storeRefreshToken("user-rotating", "old-refresh-token", {
    action: "login",
  });
  const rotated = await tokenService.rotateRefreshToken("old-refresh-token", { action: "login" });

  assert.equal(rotated.userId, "user-rotating");
  assert.equal(rotated.sessionFamilyId, familyId);
  assert.notEqual(rotated.refreshToken, "old-refresh-token");

  const db = await (await import("../../src/lib/mongodb.js")).getDb();
  const oldDoc = await db.collection("refresh_tokens").findOne({ token: "old-refresh-token" });
  assert.equal(oldDoc.used, true);

  const newDoc = await db.collection("refresh_tokens").findOne({ token: rotated.refreshToken });
  assert.equal(newDoc.sessionFamilyId, familyId);
  assert.equal(newDoc.used, false);
});

test("reuse of a used token revokes the entire refresh family", async () => {
  const familyId = await tokenService.storeRefreshToken("user-reuse", "reuse-old-token");
  const firstRotation = await tokenService.rotateRefreshToken("reuse-old-token");
  assert.ok(firstRotation);

  const reuse = await tokenService.rotateRefreshToken("reuse-old-token");
  assert.equal(reuse, null);

  const db = await (await import("../../src/lib/mongodb.js")).getDb();
  const remaining = await db.collection("refresh_tokens")
    .countDocuments({ sessionFamilyId: familyId });
  assert.equal(remaining, 0);
});

test("expired and unknown refresh tokens are rejected", async () => {
  const db = await (await import("../../src/lib/mongodb.js")).getDb();
  await db.collection("refresh_tokens").insertOne({
    userId: "expired-user",
    token: "expired-refresh-token",
    sessionFamilyId: "expired-family",
    used: false,
    createdAt: new Date(),
    expiresAt: new Date(Date.now() - 1000),
    sessionContext: { action: "default" },
  });

  assert.equal(await tokenService.rotateRefreshToken("expired-refresh-token"), null);
  assert.equal(await tokenService.rotateRefreshToken("unknown-refresh-token"), null);
  assert.equal(
    await db.collection("refresh_tokens").findOne({ token: "expired-refresh-token" }),
    null
  );
});

test("context mismatch revokes the refresh family", async () => {
  const familyId = await tokenService.storeRefreshToken("user-context", "context-old-token", {
    action: "login",
  });
  assert.equal(
    await tokenService.rotateRefreshToken("context-old-token", { action: "logout" }),
    null
  );

  const db = await (await import("../../src/lib/mongodb.js")).getDb();
  assert.equal(
    await db.collection("refresh_tokens").countDocuments({ sessionFamilyId: familyId }),
    0
  );
});
