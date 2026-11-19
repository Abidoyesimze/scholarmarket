import { describe, it, expect, vi, beforeEach } from "vitest";
import { xdr, nativeToScVal, Address, Keypair } from "@stellar/stellar-sdk";

vi.mock("@/lib/email", () => ({ sendReceiptIfEligible: vi.fn().mockResolvedValue(undefined) }));

import { runIndexerBatch } from "../stellarIndexer.js";
import { COLLECTIONS } from "@/lib/backend/schemaContracts";
import { purchaseRefundedRawEvent } from "./fixtures/refundEvents.js";

function toBase64(scVal) {
  return scVal.toXDR("base64");
}
function symbolTopic(name) {
  return toBase64(nativeToScVal(name, { type: "symbol" }));
}
function u64Topic(value) {
  return toBase64(nativeToScVal(BigInt(value), { type: "u64" }));
}
function bytesTopic(buffer) {
  return toBase64(nativeToScVal(buffer, { type: "bytes" }));
}
function addressTopic(strkey) {
  return toBase64(new Address(strkey).toScVal());
}
function vecValue(scVals) {
  return toBase64(xdr.ScVal.scvVec(scVals));
}

function purchaseCompletedRawEvent({ id, purchaseId, materialId, buyer, seller, asset, amount }) {
  return {
    id,
    ledger: 100,
    txHash: `tx-${id}`,
    ledgerClosedAt: "2026-07-25T00:00:00Z",
    topic: [
      symbolTopic("purchase"),
      symbolTopic("completed"),
      u64Topic(purchaseId),
      bytesTopic(materialId),
      addressTopic(buyer),
    ],
    value: vecValue([
      new Address(seller).toScVal(),
      new Address(asset).toScVal(),
      nativeToScVal(BigInt(amount), { type: "i128" }),
      nativeToScVal(0n, { type: "i128" }),
      nativeToScVal(BigInt(amount), { type: "i128" }),
      xdr.ScVal.scvBool(true),
      nativeToScVal(Buffer.alloc(16, 1), { type: "bytes" }),
    ]),
  };
}

// Minimal in-memory Mongo-like fake covering exactly the operations
// runIndexerBatch/applyIndexedEvent perform.
function createFakeDb() {
  const collections = new Map();
  let autoId = 0;

  function matches(doc, query) {
    return Object.entries(query).every(([k, v]) => doc?.[k] === v);
  }

  function applyUpdate(doc, update, isInsert) {
    if (update.$set) Object.assign(doc, update.$set);
    if (isInsert && update.$setOnInsert) {
      for (const [k, v] of Object.entries(update.$setOnInsert)) {
        if (!(k in doc)) doc[k] = v;
      }
    }
  }

  function collection(name) {
    if (!collections.has(name)) collections.set(name, new Map());
    const data = collections.get(name);

    return {
      async insertOne(doc) {
        if (data.has(doc._id)) {
          const err = new Error("E11000 duplicate key error");
          err.code = 11000;
          throw err;
        }
        data.set(doc._id, { ...doc });
        return { insertedId: doc._id };
      },
      async findOne(query = {}) {
        for (const doc of data.values()) {
          if (matches(doc, query)) return doc;
        }
        return null;
      },
      find(query = {}) {
        const results = Array.from(data.values()).filter((d) => matches(d, query));
        return { toArray: async () => results };
      },
      async updateOne(query, update, opts = {}) {
        for (const doc of data.values()) {
          if (matches(doc, query)) {
            applyUpdate(doc, update, false);
            return { matchedCount: 1, upsertedCount: 0 };
          }
        }
        if (opts.upsert) {
          const id = query._id ?? `auto-${++autoId}`;
          const doc = { ...query, _id: id };
          applyUpdate(doc, update, true);
          data.set(id, doc);
          return { matchedCount: 0, upsertedCount: 1 };
        }
        return { matchedCount: 0, upsertedCount: 0 };
      },
      async deleteOne(query) {
        for (const [key, doc] of data.entries()) {
          if (matches(doc, query)) {
            data.delete(key);
            return { deletedCount: 1 };
          }
        }
        return { deletedCount: 0 };
      },
      _all() {
        return Array.from(data.values());
      },
    };
  }

  return { collection };
}

beforeEach(() => vi.clearAllMocks());

describe("runIndexerBatch", () => {
  it("parses and applies a valid on-chain purchase.completed event", async () => {
    const db = createFakeDb();
    const buyer = Keypair.random().publicKey();
    const seller = Keypair.random().publicKey();
    const asset = Keypair.random().publicKey();
    const materialId = Buffer.alloc(32, 5);

    const rawEvent = purchaseCompletedRawEvent({
      id: "evt-1",
      purchaseId: 1,
      materialId,
      buyer,
      seller,
      asset,
      amount: 1_000_000,
    });

    const eventSource = {
      getEvents: vi.fn().mockResolvedValue({ events: [rawEvent], nextCursor: "cursor-1", lastLedger: 100 }),
    };

    const result = await runIndexerBatch({ db, eventSource });

    expect(result).toEqual({ applied: 1, skipped: 0, nextCursor: "cursor-1" });

    const purchases = db.collection(COLLECTIONS.purchases)._all();
    expect(purchases).toHaveLength(1);
    expect(purchases[0]).toMatchObject({
      materialId: materialId.toString("hex"),
      buyerAddress: buyer.toLowerCase(),
      sellerAddress: seller,
      amount: "1000000",
      status: "settled",
    });

    const entitlements = db.collection(COLLECTIONS.entitlementCache)._all();
    expect(entitlements).toHaveLength(1);
    expect(entitlements[0].active).toBe(true);
  });

  it("skips events with an unrecognized topic without touching the dead-letter collection", async () => {
    const db = createFakeDb();
    const unknownEvent = {
      id: "evt-unknown",
      ledger: 1,
      txHash: "tx-unknown",
      topic: [symbolTopic("some_other"), symbolTopic("thing")],
      value: vecValue([]),
    };

    const eventSource = {
      getEvents: vi.fn().mockResolvedValue({ events: [unknownEvent], nextCursor: null, lastLedger: 1 }),
    };

    const result = await runIndexerBatch({ db, eventSource });

    expect(result.applied).toBe(0);
    expect(result.skipped).toBe(1);
    expect(db.collection(COLLECTIONS.deadLetterEvents)._all()).toHaveLength(0);
    expect(db.collection(COLLECTIONS.syncEvents)._all()).toHaveLength(0);
  });

  it("prevents duplicate purchase rows across two batches for the same event id", async () => {
    const db = createFakeDb();
    const buyer = Keypair.random().publicKey();
    const seller = Keypair.random().publicKey();
    const asset = Keypair.random().publicKey();
    const materialId = Buffer.alloc(32, 9);

    const rawEvent = purchaseCompletedRawEvent({
      id: "evt-dup",
      purchaseId: 2,
      materialId,
      buyer,
      seller,
      asset,
      amount: 2_000_000,
    });

    const eventSource = {
      getEvents: vi.fn().mockResolvedValue({ events: [rawEvent], nextCursor: "c", lastLedger: 1 }),
    };

    const first = await runIndexerBatch({ db, eventSource });
    const second = await runIndexerBatch({ db, eventSource });

    expect(first).toEqual({ applied: 1, skipped: 0, nextCursor: "c" });
    expect(second).toEqual({ applied: 0, skipped: 1, nextCursor: "c" });
    expect(db.collection(COLLECTIONS.purchases)._all()).toHaveLength(1);
  });
});

describe("runIndexerBatch – purchase.refunded", () => {
  function setup() {
    const db = createFakeDb();
    const buyer = Keypair.random().publicKey();
    const seller = Keypair.random().publicKey();
    const asset = Keypair.random().publicKey();
    const materialId = Buffer.alloc(32, 11);
    const purchaseEvent = purchaseCompletedRawEvent({
      id: "evt-purchase",
      purchaseId: 7,
      materialId,
      buyer,
      seller,
      asset,
      amount: 3_000_000,
    });
    const refundEvent = purchaseRefundedRawEvent({
      id: "evt-refund",
      purchaseId: 7,
      materialId,
      buyer,
      asset,
      refundAmount: 3_000_000,
    });
    const enqueue = vi.fn().mockResolvedValue(undefined);
    return { db, buyer, materialId, purchaseEvent, refundEvent, enqueue };
  }

  function sourceOf(events) {
    return { getEvents: vi.fn().mockResolvedValue({ events, nextCursor: "c", lastLedger: 200 }) };
  }

  it("revokes the entitlement and marks the purchase refunded within one cycle", async () => {
    const { db, buyer, materialId, purchaseEvent, refundEvent, enqueue } = setup();

    const result = await runIndexerBatch({ db, eventSource: sourceOf([purchaseEvent, refundEvent]), enqueue });

    expect(result).toEqual({ applied: 2, skipped: 0, nextCursor: "c" });

    const [entitlement] = db.collection(COLLECTIONS.entitlementCache)._all();
    expect(entitlement).toMatchObject({
      materialId: materialId.toString("hex"),
      buyerAddress: buyer.toLowerCase(),
      active: false,
      settlementState: "Refunded",
      refundEventId: "evt-refund",
    });

    const [purchase] = db.collection(COLLECTIONS.purchases)._all();
    expect(purchase).toMatchObject({
      status: "refunded",
      refundEventId: "evt-refund",
      refundedChainPurchaseId: "7",
      refundAmount: "3000000",
    });
  });

  it("enqueues a refund email to the buyer via the outbox", async () => {
    const { db, buyer, materialId, purchaseEvent, refundEvent, enqueue } = setup();

    await runIndexerBatch({ db, eventSource: sourceOf([purchaseEvent, refundEvent]), enqueue });

    const refundCalls = enqueue.mock.calls.filter(([entry]) => entry.intent.channel === "purchase_refund");
    expect(refundCalls).toHaveLength(1);
    expect(refundCalls[0][0]).toMatchObject({
      sourceAggregate: "purchase",
      intent: {
        type: "email",
        channel: "purchase_refund",
        payload: {
          refundEventId: "evt-refund",
          materialId: materialId.toString("hex"),
          buyerAddress: buyer.toLowerCase(),
          refundAmount: "3000000",
        },
      },
    });
  });

  it("does not double-process a refund when the same ledger range is replayed", async () => {
    const { db, purchaseEvent, refundEvent, enqueue } = setup();
    const eventSource = sourceOf([purchaseEvent, refundEvent]);

    await runIndexerBatch({ db, eventSource, enqueue });
    const replay = await runIndexerBatch({ db, eventSource, enqueue });

    expect(replay).toEqual({ applied: 0, skipped: 2, nextCursor: "c" });

    const refundEmails = enqueue.mock.calls.filter(([entry]) => entry.intent.channel === "purchase_refund");
    expect(refundEmails).toHaveLength(1);

    // Replaying purchase.completed must not re-grant access after the refund.
    const entitlements = db.collection(COLLECTIONS.entitlementCache)._all();
    expect(entitlements).toHaveLength(1);
    expect(entitlements[0].active).toBe(false);
    expect(db.collection(COLLECTIONS.purchases)._all()[0].status).toBe("refunded");
  });

  it("revokes access even if the refund is indexed before the purchase was seen", async () => {
    const { db, refundEvent, enqueue } = setup();

    await runIndexerBatch({ db, eventSource: sourceOf([refundEvent]), enqueue });

    const [entitlement] = db.collection(COLLECTIONS.entitlementCache)._all();
    expect(entitlement.active).toBe(false);
    expect(enqueue).toHaveBeenCalledTimes(1);
  });
});
