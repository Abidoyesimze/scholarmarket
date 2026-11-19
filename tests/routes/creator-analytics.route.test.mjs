/**
 * Route tests for GET /api/creator/analytics and GET /api/creator/analytics/export
 * Verifies revenue computation, refund subtraction, creator isolation, and CSV export.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { ObjectId } from "mongodb";
import { GET as getAnalytics } from "../../src/app/api/creator/analytics/route.js";
import { GET as getExport } from "../../src/app/api/creator/analytics/export/route.js";
import * as authModule from "../../src/lib/api/auth.js";

// Standard RFC 4180 CSV parser to assert CSV parsing correctness
function parseCsv(csvText) {
  const rows = [];
  let currentRow = [];
  let currentField = "";
  let inQuotes = false;

  for (let i = 0; i < csvText.length; i++) {
    const char = csvText[i];
    const nextChar = csvText[i + 1];

    if (inQuotes) {
      if (char === '"') {
        if (nextChar === '"') {
          currentField += '"';
          i++; // skip escaped quote
        } else {
          inQuotes = false;
        }
      } else {
        currentField += char;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
      } else if (char === ',') {
        currentRow.push(currentField);
        currentField = "";
      } else if (char === '\n' || char === '\r') {
        if (char === '\r' && nextChar === '\n') {
          i++; // handle CRLF
        }
        currentRow.push(currentField);
        currentField = "";
        if (currentRow.length > 0 && currentRow.some((f) => f.length > 0)) {
          rows.push(currentRow);
        }
        currentRow = [];
      } else {
        currentField += char;
      }
    }
  }

  if (currentField.length > 0 || currentRow.length > 0) {
    currentRow.push(currentField);
    rows.push(currentRow);
  }

  return rows;
}

function matchesQuery(doc, query = {}) {
  return Object.entries(query).every(([key, value]) => {
    if (key === "$or" && Array.isArray(value)) {
      return value.some((subQuery) => matchesQuery(doc, subQuery));
    }
    if (value && typeof value === "object" && !(value instanceof ObjectId)) {
      if ("$in" in value) {
        return value.$in.map(String).includes(String(doc[key]));
      }
      if ("$nin" in value) {
        return !value.$nin.map(String).includes(String(doc[key]));
      }
      if ("$gte" in value && "$lte" in value) {
        return doc[key] >= value.$gte && doc[key] <= value.$lte;
      }
      if ("$gte" in value) return doc[key] >= value.$gte;
      if ("$lte" in value) return doc[key] <= value.$lte;
    }
    return String(doc[key]) === String(value);
  });
}

function makeCursor(results) {
  return {
    toArray: async () => results,
    sort: () => makeCursor(results),
    limit: (count) => makeCursor(results.slice(0, count)),
  };
}

function makeCollection(docs = []) {
  const store = [...docs];

  return {
    _store: store,

    async find(query = {}) {
      return makeCursor(store.filter((doc) => matchesQuery(doc, query)));
    },

    async findOne(query = {}) {
      return store.find((doc) => matchesQuery(doc, query)) ?? null;
    },

    async aggregate(pipeline) {
      let current = [...store];

      for (const stage of pipeline) {
        if (stage.$match) {
          current = current.filter((doc) => matchesQuery(doc, stage.$match));
        }

        if (stage.$count) {
          const field = stage.$count;
          return makeCursor(current.length === 0 ? [] : [{ [field]: current.length }]);
        }

        if (stage.$group) {
          const groupStage = stage.$group;
          const groups = new Map();

          for (const doc of current) {
            const key =
              groupStage._id === null
                ? null
                : doc[groupStage._id?.replace?.("$", "")];
            const existing = groups.get(key) ?? { _id: key };

            for (const [field, expression] of Object.entries(groupStage)) {
              if (field === "_id") continue;
              if (expression.$sum) {
                const value =
                  typeof expression.$sum === "number"
                    ? expression.$sum
                    : Number(
                        doc[
                          String(
                            expression.$sum.$toDouble ?? expression.$sum
                          ).replace("$", "")
                        ]
                      ) || 0;
                existing[field] = (existing[field] ?? 0) + value;
              }
            }

            groups.set(key, existing);
          }

          current = [...groups.values()];
        }

        if (stage.$sort) {
          // preserve current
        }

        if (stage.$limit) {
          current = current.slice(0, stage.$limit);
        }
      }

      return makeCursor(current);
    },
  };
}

function makeDb(collections = {}) {
  return {
    collection: (name) => collections[name] ?? makeCollection(),
  };
}

describe("Creator Analytics & Export Route Handlers", () => {
  const now = new Date();
  const dayMs = 24 * 60 * 60 * 1000;

  const CREATOR_ALICE = "GCREATOR_ALICE";
  const CREATOR_BOB = "GCREATOR_BOB";

  // Fixture materials
  const matAlice1 = {
    _id: "mat-alice-1",
    materialId: "mat-alice-1",
    title: 'Intro to "Stellar" & Smart Contracts',
    userAddress: CREATOR_ALICE,
    visibility: "public",
    price: 100,
    views: 10,
    downloads: 5,
    reviewsCount: 2,
    createdAt: new Date(now.getTime() - 40 * dayMs),
  };

  const matAlice2 = {
    _id: "mat-alice-2",
    materialId: "mat-alice-2",
    title: "Advanced Soroban",
    userAddress: CREATOR_ALICE,
    visibility: "public",
    price: 200,
    views: 8,
    downloads: 3,
    reviewsCount: 1,
    createdAt: new Date(now.getTime() - 25 * dayMs),
  };

  const matBob = {
    _id: "mat-bob-1",
    materialId: "mat-bob-1",
    title: "Bob Private Material",
    userAddress: CREATOR_BOB,
    visibility: "public",
    price: 500,
    views: 4,
    downloads: 1,
    reviewsCount: 1,
    createdAt: new Date(now.getTime() - 15 * dayMs),
  };

  // Fixture purchases:
  // Alice:
  // - Purchase 1: $100 confirmed (10 days ago)
  // - Purchase 2: $50 settled (20 days ago)
  // - Purchase 3: $30 refunded (5 days ago)
  // - Purchase 4: $200 completed (2 days ago)
  // Bob:
  // - Purchase 5: $500 confirmed (3 days ago)
  const purchasesFixture = [
    {
      _id: "p1",
      materialId: "mat-alice-1",
      buyerAddress: "GBUYER_1",
      amount: "100.00",
      status: "confirmed",
      currency: "XLM",
      purchasedAt: new Date(now.getTime() - 10 * dayMs),
    },
    {
      _id: "p2",
      materialId: "mat-alice-1",
      buyerAddress: "GBUYER_2",
      amount: "50.00",
      status: "settled",
      currency: "XLM",
      purchasedAt: new Date(now.getTime() - 20 * dayMs),
    },
    {
      _id: "p3",
      materialId: "mat-alice-1",
      buyerAddress: "GBUYER_3",
      amount: "30.00",
      status: "refunded",
      currency: "XLM",
      purchasedAt: new Date(now.getTime() - 5 * dayMs),
    },
    {
      _id: "p4",
      materialId: "mat-alice-2",
      buyerAddress: "GBUYER_4",
      amount: "200.00",
      status: "completed",
      currency: "XLM",
      purchasedAt: new Date(now.getTime() - 2 * dayMs),
    },
    {
      _id: "p5",
      materialId: "mat-bob-1",
      buyerAddress: "GBUYER_5",
      amount: "500.00",
      status: "confirmed",
      currency: "XLM",
      purchasedAt: new Date(now.getTime() - 3 * dayMs),
    },
  ];

  // Fixture refunds:
  // - Alice refund from refunds collection: $20 for mat-alice-2
  const refundsFixture = [
    {
      _id: "ref-1",
      materialId: "mat-alice-2",
      creatorAddress: CREATOR_ALICE,
      buyerAddress: "GBUYER_4",
      amount: 20,
      asset: "XLM",
      status: "approved",
      createdAt: new Date(now.getTime() - 1 * dayMs),
    },
  ];

  // Fixture payouts:
  // - Alice payout: $50
  const payoutsFixture = [
    {
      _id: "pay-1",
      creatorAddress: CREATOR_ALICE,
      amount: 50,
      currency: "XLM",
      status: "completed",
      createdAt: new Date(now.getTime() - 4 * dayMs),
    },
  ];

  let mockDb;

  beforeEach(() => {
    mockDb = makeDb({
      materials: makeCollection([matAlice1, matAlice2, matBob]),
      purchases: makeCollection(purchasesFixture),
      refunds: makeCollection(refundsFixture),
      payouts: makeCollection(payoutsFixture),
      saved_materials: makeCollection([
        { materialId: "mat-alice-1", walletAddress: "GBUYER_1" },
        { materialId: "mat-alice-2", walletAddress: "GBUYER_2" },
      ]),
    });

    globalThis._mongoClientPromise = Promise.resolve({
      db: () => mockDb,
    });
  });

  afterEach(() => {
    globalThis._mongoClientPromise = null;
  });

  it("GET /api/creator/analytics asserts totals for known fixtures and subtracts refunds", async () => {
    // Authenticate as Alice
    authModule.getUserFromCookie = async () => ({
      walletAddress: CREATOR_ALICE,
    });

    const request = new Request("http://localhost:3000/api/creator/analytics");
    const response = await getAnalytics(request);
    expect(response.status).toBe(200);

    const data = await response.json();

    // Completed purchases: $100 + $50 + $200 = $350 gross revenue
    // Total refunds: $30 (refunded purchase) + $20 (refunds collection) = $50
    // Net revenue: $350 - $50 = $300
    expect(data.totalSales).toBe(3); // p1, p2, p4 (p3 is refunded)
    expect(data.completedOrders).toBe(3);
    expect(data.totalRevenue).toBe(300); // 350 gross - 50 refunds
    expect(data.uploadCount).toBe(2);
    expect(data.publishedCount).toBe(2);
  });

  it("GET /api/creator/analytics filters correctly across date ranges", async () => {
    authModule.getUserFromCookie = async () => ({
      walletAddress: CREATOR_ALICE,
    });

    // Date range: 7 days ago to now
    // Completed purchases within this range: Purchase 4 ($200 completed, 2 days ago)
    const from = new Date(now.getTime() - 7 * dayMs).toISOString();
    const to = now.toISOString();

    const request = new Request(
      `http://localhost:3000/api/creator/analytics?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`
    );
    const response = await getAnalytics(request);
    expect(response.status).toBe(200);

    const data = await response.json();
    expect(data.monthlySales).toBe(1); // Only p4 falls in the 7-day range
  });

  it("GET /api/creator/analytics enforces creator isolation (cannot see other creator's data)", async () => {
    // Authenticate as Bob
    authModule.getUserFromCookie = async () => ({
      walletAddress: CREATOR_BOB,
    });

    const request = new Request("http://localhost:3000/api/creator/analytics");
    const response = await getAnalytics(request);
    expect(response.status).toBe(200);

    const data = await response.json();
    // Bob has 1 material ($500 confirmed purchase)
    expect(data.totalRevenue).toBe(500);
    expect(data.totalSales).toBe(1);
    expect(data.uploadCount).toBe(1);

    // Bob cannot see Alice's purchases or revenue
    expect(data.topMaterials.length).toBe(1);
    expect(data.topMaterials[0].id).toBe("mat-bob-1");
  });

  it("GET /api/creator/analytics rejects unauthenticated requests with 401", async () => {
    authModule.getUserFromCookie = async () => null;

    const request = new Request("http://localhost:3000/api/creator/analytics");
    const response = await getAnalytics(request);
    expect(response.status).toBe(401);

    const data = await response.json();
    expect(data.error).toBe("Unauthorized");
  });

  it("GET /api/creator/analytics/export asserts CSV headers, escaping, row count, and clean standard parsing", async () => {
    authModule.getUserFromCookie = async () => ({
      walletAddress: CREATOR_ALICE,
    });

    const request = new Request("http://localhost:3000/api/creator/analytics/export");
    const response = await getExport(request);
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("text/csv");
    expect(response.headers.get("Content-Disposition")).toContain(
      `attachment; filename="analytics-${CREATOR_ALICE}.csv"`
    );

    const csvText = await response.text();
    expect(csvText).toBeDefined();

    // Parse with standard RFC 4180 CSV parser
    const parsedRows = parseCsv(csvText);

    // Assert headers
    const expectedHeaders = ["Date", "Item ID", "Buyer Wallet", "Price", "Paid Asset", "Status"];
    expect(parsedRows[0]).toEqual(expectedHeaders);

    // Alice should have:
    // - 4 purchases (p1, p2, p3, p4)
    // - 1 refund (ref-1)
    // - 1 payout (pay-1)
    // Total data rows = 6 (+ 1 header row = 7 rows)
    expect(parsedRows.length).toBe(7);

    // Assert every row has exactly 6 columns
    for (const row of parsedRows) {
      expect(row.length).toBe(6);
    }

    // Assert refunds and payouts have subtracted/negative prices
    const refundRows = parsedRows.filter((row) => row[5] === "refunded");
    expect(refundRows.length).toBe(2); // p3 (refunded purchase) and ref-1 (refund doc)
    for (const r of refundRows) {
      expect(Number(r[3])).toBeLessThan(0);
    }

    const payoutRows = parsedRows.filter((row) => row[1] === "Payout");
    expect(payoutRows.length).toBe(1);
    expect(Number(payoutRows[0][3])).toBe(-50);
  });

  it("GET /api/creator/analytics/export properly escapes special characters (quotes, commas) according to RFC 4180", async () => {
    // Add a material with quotes and commas in ID or fields
    const trickyMaterial = {
      _id: 'mat,"special"-quotes',
      materialId: 'mat,"special"-quotes',
      title: 'Commas, and "Quotes"',
      userAddress: "GCREATOR_TRICKY",
    };
    const trickyPurchase = {
      _id: "pt1",
      materialId: 'mat,"special"-quotes',
      buyerAddress: 'G"BUYER",TRICKY',
      amount: "15.00",
      status: "completed",
      currency: "XLM",
      purchasedAt: new Date(),
    };

    const trickyDb = makeDb({
      materials: makeCollection([trickyMaterial]),
      purchases: makeCollection([trickyPurchase]),
      refunds: makeCollection([]),
      payouts: makeCollection([]),
    });

    globalThis._mongoClientPromise = Promise.resolve({
      db: () => trickyDb,
    });

    authModule.getUserFromCookie = async () => ({
      walletAddress: "GCREATOR_TRICKY",
    });

    const request = new Request("http://localhost:3000/api/creator/analytics/export");
    const response = await getExport(request);
    const csvText = await response.text();

    const parsedRows = parseCsv(csvText);
    expect(parsedRows.length).toBe(2); // 1 header + 1 data row

    // Verify tricky characters were parsed without distortion
    const dataRow = parsedRows[1];
    expect(dataRow[1]).toBe('mat,"special"-quotes');
    expect(dataRow[2]).toBe('G"BUYER",TRICKY');
    expect(dataRow[3]).toBe("15");
  });

  it("GET /api/creator/analytics/export enforces creator isolation", async () => {
    authModule.getUserFromCookie = async () => ({
      walletAddress: CREATOR_BOB,
    });

    const request = new Request("http://localhost:3000/api/creator/analytics/export");
    const response = await getExport(request);
    const csvText = await response.text();

    const parsedRows = parseCsv(csvText);
    // Bob should have 1 header + 1 purchase (p5) = 2 rows
    expect(parsedRows.length).toBe(2);
    expect(parsedRows[1][1]).toBe("mat-bob-1");
    expect(parsedRows[1][2]).toBe("GBUYER_5");
  });
});
