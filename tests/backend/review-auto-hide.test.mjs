import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { ObjectId } from "mongodb";
import { POST, PATCH } from "../../src/app/api/reviews/report/route.js";

const JWT_SECRET = "secret-for-review-auto-hide-test-32chars!";
process.env.JWT_SECRET = JWT_SECRET;
process.env.REVIEW_AUTO_HIDE_THRESHOLD = "3";
process.env.MONGODB_URI = "mongodb://localhost:27017";

function base64UrlEncode(value) {
  return Buffer.from(value).toString("base64url");
}

function signJwt(payload) {
  const header = { alg: "HS256", typ: "JWT" };
  const now = Math.floor(Date.now() / 1000);
  const body = {
    ...payload,
    exp: now + 3600,
  };

  const headerPart = base64UrlEncode(JSON.stringify(header));
  const payloadPart = base64UrlEncode(JSON.stringify(body));
  const signature = createHmac("sha256", JWT_SECRET)
    .update(`${headerPart}.${payloadPart}`)
    .digest("base64url");

  return `${headerPart}.${payloadPart}.${signature}`;
}

function createMockRequest({ body, cookieToken = null, bearerToken = null, url = "http://localhost/api/reviews/report" } = {}) {
  const headers = new Map();
  if (cookieToken) {
    headers.set("cookie", `auth_token=${encodeURIComponent(cookieToken)}`);
  }
  if (bearerToken) {
    headers.set("authorization", `Bearer ${bearerToken}`);
  }
  return {
    url,
    headers: {
      get: (name) => headers.get(name.toLowerCase()) || null,
    },
    json: async () => body,
  };
}

function createInMemoryDb() {
  const collections = {
    materials: [],
    reviews: [],
    reported_reviews: [],
    moderation_queue: [],
    notifications: [],
  };

  const wrapDoc = (doc) => ({
    ...doc,
    _id: doc._id || new ObjectId(),
  });

  const getCollection = (name) => {
    if (!collections[name]) collections[name] = [];
    const store = collections[name];

    return {
      _store: store,
      findOne: async (query) => {
        return (
          store.find((doc) => {
            for (const [key, val] of Object.entries(query)) {
              if (key === "$or") {
                const matched = val.some((subQuery) => {
                  return Object.entries(subQuery).every(([sk, sv]) => {
                    return String(doc[sk]) === String(sv);
                  });
                });
                if (!matched) return false;
                continue;
              }
              if (val instanceof ObjectId) {
                if (String(doc[key]) !== String(val)) return false;
              } else if (typeof val === "object" && val !== null) {
                if (val.$in && !val.$in.map(String).includes(String(doc[key]))) return false;
                if (val.$nin && val.$nin.map(String).includes(String(doc[key]))) return false;
              } else if (String(doc[key]) !== String(val)) {
                return false;
              }
            }
            return true;
          }) || null
        );
      },
      insertOne: async (doc) => {
        const wrapped = wrapDoc(doc);
        store.push(wrapped);
        return { insertedId: wrapped._id };
      },
      distinct: async (field, query) => {
        const matches = store.filter((doc) => {
          for (const [k, v] of Object.entries(query || {})) {
            if (String(doc[k]) !== String(v)) return false;
          }
          return true;
        });
        const values = matches.map((d) => d[field]).filter(Boolean);
        return [...new Set(values.map((v) => String(v).toLowerCase()))];
      },
      createIndex: async () => {},
      updateOne: async (query, update, options) => {
        let doc = store.find((d) => {
          for (const [k, v] of Object.entries(query)) {
            if (String(d[k]) !== String(v)) return false;
          }
          return true;
        });

        if (!doc && options?.upsert) {
          doc = wrapDoc({ ...query, ...(update.$setOnInsert || {}) });
          store.push(doc);
        }

        if (doc) {
          if (update.$set) {
            Object.assign(doc, update.$set);
          }
          if (update.$inc) {
            for (const [k, v] of Object.entries(update.$inc)) {
              doc[k] = (doc[k] || 0) + v;
            }
          }
          if (update.$unset) {
            for (const k of Object.keys(update.$unset)) {
              delete doc[k];
            }
          }
        }
        return { matchedCount: doc ? 1 : 0, modifiedCount: doc ? 1 : 0 };
      },
      updateMany: async (query, update) => {
        let count = 0;
        for (const doc of store) {
          let match = true;
          for (const [k, v] of Object.entries(query)) {
            if (String(doc[k]) !== String(v)) {
              match = false;
              break;
            }
          }
          if (match) {
            if (update.$set) Object.assign(doc, update.$set);
            count++;
          }
        }
        return { matchedCount: count, modifiedCount: count };
      },
      find: (query = {}) => {
        const matched = store.filter((doc) => {
          for (const [k, v] of Object.entries(query)) {
            if (typeof v === "object" && v !== null && v.$nin) {
              if (v.$nin.map(String).includes(String(doc[k]))) return false;
            } else if (String(doc[k]) !== String(v)) {
              return false;
            }
          }
          return true;
        });
        return {
          sort: () => ({
            limit: () => ({
              toArray: async () => matched,
            }),
            toArray: async () => matched,
          }),
          toArray: async () => matched,
        };
      },
      aggregate: (pipeline = []) => {
        return {
          toArray: async () => {
            let res = [...store];
            for (const stage of pipeline) {
              if (stage.$match) {
                res = res.filter((d) => {
                  for (const [k, v] of Object.entries(stage.$match)) {
                    if (v && v.$nin) {
                      if (v.$nin.includes(d[k])) return false;
                    }
                  }
                  return true;
                });
              }
              if (stage.$group) {
                const total = res.reduce((acc, curr) => acc + (curr.rating || 0), 0);
                return [{ averageRating: res.length ? total / res.length : 0, reviewCount: res.length }];
              }
            }
            return res;
          },
        };
      },
    };
  };

  return {
    collection: getCollection,
    _collections: collections,
  };
}

test("Review Auto-Hide Threshold & Admin Moderation", async (t) => {
  const mockDb = createInMemoryDb();
  globalThis._mongoClientPromise = Promise.resolve({
    db: () => mockDb,
  });

  const materialId = new ObjectId();
  const reviewId = new ObjectId();
  const authorAddress = "GCAUTHOR123";

  // Seed material and review
  mockDb._collections.materials.push({
    _id: materialId,
    title: "Introduction to Stellar",
    creator: "GCCREATOR123",
  });

  mockDb._collections.reviews.push({
    _id: reviewId,
    materialId,
    reviewerAddress: authorAddress,
    rating: 1,
    comment: "Spam content",
    createdAt: new Date(),
    status: "active",
  });

  const user1Token = signJwt({ sub: "user-1", walletAddress: "GCUSER1" });
  const user2Token = signJwt({ sub: "user-2", walletAddress: "GCUSER2" });
  const user3Token = signJwt({ sub: "user-3", walletAddress: "GCUSER3" });
  const adminToken = signJwt({ sub: "admin-1", walletAddress: "GBADMIN", role: "admin" });

  await t.test("first distinct user reports review without triggering auto-hide", async () => {
    const req1 = createMockRequest({
      cookieToken: user1Token,
      body: {
        reviewId: reviewId.toString(),
        materialId: materialId.toString(),
        reason: "abusive",
      },
    });

    const res1 = await POST(req1);
    const body1 = await res1.json();
    assert.equal(res1.status, 201);
    assert.equal(body1.success, true);
    assert.equal(body1.distinctReporters, 1);
    assert.equal(body1.autoHidden, false);

    const review = await mockDb.collection("reviews").findOne({ _id: reviewId });
    assert.equal(review.status, "active");
  });

  await t.test("repeat report from same user is rejected with 409 and does not count twice", async () => {
    const reqRepeat = createMockRequest({
      cookieToken: user1Token,
      body: {
        reviewId: reviewId.toString(),
        materialId: materialId.toString(),
        reason: "spam",
      },
    });

    const resRepeat = await POST(reqRepeat);
    const bodyRepeat = await resRepeat.json();
    assert.equal(resRepeat.status, 409);
    assert.match(bodyRepeat.error, /already reported/i);

    const distinct = await mockDb
      .collection("reported_reviews")
      .distinct("reportedBy", { reviewId });
    assert.equal(distinct.length, 1);
  });

  await t.test("second distinct user reports review without triggering auto-hide", async () => {
    const req2 = createMockRequest({
      cookieToken: user2Token,
      body: {
        reviewId: reviewId.toString(),
        materialId: materialId.toString(),
        reason: "inappropriate",
      },
    });

    const res2 = await POST(req2);
    const body2 = await res2.json();
    assert.equal(res2.status, 201);
    assert.equal(body2.distinctReporters, 2);
    assert.equal(body2.autoHidden, false);

    const review = await mockDb.collection("reviews").findOne({ _id: reviewId });
    assert.equal(review.status, "active");
  });

  await t.test("review reported by N distinct users (threshold=3) is automatically marked hidden_pending_review", async () => {
    const req3 = createMockRequest({
      cookieToken: user3Token,
      body: {
        reviewId: reviewId.toString(),
        materialId: materialId.toString(),
        reason: "abusive",
      },
    });

    const res3 = await POST(req3);
    const body3 = await res3.json();
    assert.equal(res3.status, 201);
    assert.equal(body3.distinctReporters, 3);
    assert.equal(body3.autoHidden, true);

    // Assert review status is hidden_pending_review
    const review = await mockDb.collection("reviews").findOne({ _id: reviewId });
    assert.equal(review.status, "hidden_pending_review");
    assert.equal(review.autoHidden, true);
    assert.ok(review.hiddenAt);

    // Assert added to moderation queue
    const queueItem = await mockDb.collection("moderation_queue").findOne({ reviewId });
    assert.ok(queueItem);
    assert.equal(queueItem.status, "pending_review");
    assert.equal(queueItem.reporterCount, 3);
    assert.equal(queueItem.autoHidden, true);

    // Assert author notified
    const notification = await mockDb.collection("notifications").findOne({
      recipient: authorAddress.toLowerCase(),
      type: "review_hidden",
    });
    assert.ok(notification);
    assert.match(notification.title, /hidden/i);
    assert.equal(notification.metadata.reviewId, reviewId.toString());
  });

  await t.test("non-admin cannot restore or remove review", async () => {
    const req = createMockRequest({
      cookieToken: user1Token,
      body: {
        reviewId: reviewId.toString(),
        action: "restore",
      },
    });

    const res = await PATCH(req);
    assert.equal(res.status, 403);
  });

  await t.test("admin can restore hidden review", async () => {
    const req = createMockRequest({
      cookieToken: adminToken,
      body: {
        reviewId: reviewId.toString(),
        action: "restore",
        notes: "Approved after investigation",
      },
    });

    const res = await PATCH(req);
    const body = await res.json();
    assert.equal(res.status, 200);
    assert.equal(body.success, true);
    assert.equal(body.action, "restore");

    const review = await mockDb.collection("reviews").findOne({ _id: reviewId });
    assert.equal(review.status, "active");
    assert.equal(review.autoHidden, false);

    const queueItem = await mockDb.collection("moderation_queue").findOne({ reviewId });
    assert.equal(queueItem.status, "resolved");
    assert.equal(queueItem.moderationAction, "restored");
  });

  await t.test("admin can permanently remove review", async () => {
    const req = createMockRequest({
      cookieToken: adminToken,
      body: {
        reviewId: reviewId.toString(),
        action: "remove",
        notes: "Violation confirmed",
      },
    });

    const res = await PATCH(req);
    const body = await res.json();
    assert.equal(res.status, 200);
    assert.equal(body.success, true);
    assert.equal(body.action, "remove");

    const review = await mockDb.collection("reviews").findOne({ _id: reviewId });
    assert.equal(review.status, "permanently_removed");

    const queueItem = await mockDb.collection("moderation_queue").findOne({ reviewId });
    assert.equal(queueItem.status, "resolved");
    assert.equal(queueItem.moderationAction, "permanently_removed");
  });

  globalThis._mongoClientPromise = null;
});
