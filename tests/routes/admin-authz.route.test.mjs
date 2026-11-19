/**
 * Admin Authorization Test Matrix
 *
 * Proves that all administrative endpoints enforce strict role-based access control:
 *  - No token -> 401
 *  - Non-admin token -> 403
 *  - Admin token -> 2xx
 *  - Audit log entries are recorded for admin actions
 *  - Dynamically scans src/app/api/admin to ensure any newly added admin route
 *    is covered and strictly enforces authentication.
 */

import assert from "node:assert/strict";
import { describe, it, before, beforeEach, after } from "node:test";
import { createHmac } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { register } from "node:module";

try {
  register("../../test/alias-loader.mjs", import.meta.url);
} catch {}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "../..");

const JWT_SECRET = "admin-authz-test-secret-key-32chars!";
process.env.JWT_SECRET = JWT_SECRET;

function base64UrlEncode(value) {
  return Buffer.from(value).toString("base64url");
}

function signJwt(payload, signingSecret = JWT_SECRET, { exp } = {}) {
  const header = { alg: "HS256", typ: "JWT" };
  const now = Math.floor(Date.now() / 1000);
  const body = { ...payload };

  if (typeof exp === "number") {
    body.exp = exp;
  } else if (exp !== null) {
    body.exp = now + 3600;
  }

  const headerPart = base64UrlEncode(JSON.stringify(header));
  const payloadPart = base64UrlEncode(JSON.stringify(body));
  const signature = createHmac("sha256", signingSecret)
    .update(`${headerPart}.${payloadPart}`)
    .digest("base64url");

  return `${headerPart}.${payloadPart}.${signature}`;
}

const adminToken = signJwt({
  sub: "admin-user-001",
  role: "admin",
  walletAddress: "GBADMINWALLET1111111111111111111111111111111111111111",
});

const nonAdminToken = signJwt({
  sub: "regular-user-002",
  role: "learner",
  walletAddress: "GBUSERWALLET2222222222222222222222222222222222222222",
});

function createMockRequest({
  url = "http://localhost:3000/api/admin/test",
  method = "GET",
  token = null,
  body = null,
  headers = {},
} = {}) {
  const reqHeaders = new Headers(headers);

  if (token) {
    reqHeaders.set("cookie", `auth_token=${encodeURIComponent(token)}`);
  }

  const init = {
    method,
    headers: reqHeaders,
  };

  if (body && method !== "GET" && method !== "HEAD") {
    reqHeaders.set("content-type", "application/json");
    init.body = JSON.stringify(body);
  }

  return new Request(url, init);
}

// In-memory mock database for 2xx admin calls
const sampleObjectId = "507f1f77bcf86cd799439011";
let mockAuditTrail = [];
let mockDbState = {};

function resetMockDbState() {
  mockAuditTrail = [];
  mockDbState = {
    disputes: [
      { _id: "disp-1", status: "open", title: "Disputed item" },
    ],
    refunds: [
      {
        _id: { toString: () => sampleObjectId, equals: (id) => String(id) === sampleObjectId },
        buyerAddress: "GBBUYER123",
        amount: 50,
        asset: "USDC",
        status: "pending",
      },
    ],
    users: [
      {
        _id: { toString: () => sampleObjectId, equals: (id) => String(id) === sampleObjectId },
        status: "active",
        email: "learner@example.com",
      },
    ],
    verification_applications: [
      {
        _id: "app-1",
        status: "pending",
        userUuid: "user-uuid-1",
        requestedType: "institution",
      },
    ],
    profiles: [
      { uuid: "user-uuid-1", profileType: "standard" },
    ],
    materials: [
      {
        _id: { toString: () => sampleObjectId, equals: (id) => String(id) === sampleObjectId },
        title: "Test Courseware",
        storageKey: "bafytest123",
        flagged: false,
      },
    ],
    admin_audit_trail: mockAuditTrail,
  };
}

resetMockDbState();

function createMockDb() {
  return {
    collection: (name) => {
      const records = mockDbState[name] || [];
      return {
        createIndex: async () => {},
        find: () => ({
          sort: () => ({
            limit: () => ({
              toArray: async () => records,
            }),
            toArray: async () => records,
          }),
          toArray: async () => records,
        }),
        findOne: async (query) => {
          if (query._id) {
            const queryIdStr = query._id?.toString ? query._id.toString() : String(query._id);
            return records.find((r) => {
              const rIdStr = r._id?.toString ? r._id.toString() : String(r._id);
              return rIdStr === queryIdStr;
            }) || null;
          }
          return records[0] || null;
        },
        updateOne: async (filter, update) => {
          const item = await createMockDb().collection(name).findOne(filter);
          if (item && update.$set) {
            Object.assign(item, update.$set);
            return { matchedCount: 1, modifiedCount: 1 };
          }
          return { matchedCount: item ? 1 : 0, modifiedCount: 0 };
        },
        deleteOne: async () => ({ deletedCount: 1 }),
        deleteMany: async () => ({ deletedCount: 0 }),
        insertOne: async (doc) => {
          records.push(doc);
          return { insertedId: "gen-id" };
        },
      };
    },
  };
}

/**
 * Table of Admin Endpoints
 * Easily extensible table mapping routes to methods, handlers, and audit expectations.
 */
export const ADMIN_ROUTE_MATRIX = [
  {
    name: "Admin Disputes - List",
    path: "/api/admin/disputes",
    method: "GET",
    routeFile: "src/app/api/admin/disputes/route.js",
    isMutatingAction: false,
    buildPayload: () => ({}),
  },
  {
    name: "Admin Disputes - Resolve",
    path: "/api/admin/disputes",
    method: "PATCH",
    routeFile: "src/app/api/admin/disputes/route.js",
    isMutatingAction: true,
    expectedAuditEvent: "admin_dispute_resolved",
    buildPayload: () => ({
      body: { disputeId: "disp-1", status: "resolved", resolution: "Refund granted" },
    }),
  },
  {
    name: "Admin Refunds - Approve",
    path: "/api/admin/refunds/approve",
    method: "POST",
    routeFile: "src/app/api/admin/refunds/approve/route.js",
    isMutatingAction: true,
    expectedAuditEvent: "admin_refund_approved",
    buildPayload: () => ({
      body: { refundId: sampleObjectId },
    }),
  },
  {
    name: "Admin Users - Suspend / Reactivate",
    path: "/api/admin/users/suspend",
    method: "POST",
    routeFile: "src/app/api/admin/users/suspend/route.js",
    isMutatingAction: true,
    expectedAuditEvent: "user_suspended",
    buildPayload: () => ({
      body: { userId: sampleObjectId, action: "suspend", reason: "Terms breach" },
    }),
  },
  {
    name: "Admin Verification - List Applications",
    path: "/api/admin/verification",
    method: "GET",
    routeFile: "src/app/api/admin/verification/route.js",
    isMutatingAction: false,
    buildPayload: () => ({}),
  },
  {
    name: "Admin Verification - Approve Application",
    path: "/api/admin/verification",
    method: "POST",
    routeFile: "src/app/api/admin/verification/route.js",
    isMutatingAction: true,
    expectedAuditEvent: "admin_verification_approve",
    buildPayload: () => ({
      body: { applicationId: "app-1", action: "approve" },
    }),
  },
  {
    name: "Admin Materials - Flag Material",
    path: "/api/admin/materials/:id/flag",
    method: "POST",
    routeFile: "src/app/api/admin/materials/[id]/flag/route.js",
    isMutatingAction: true,
    expectedAuditEvent: "material_flagged",
    buildPayload: () => ({
      context: { params: Promise.resolve({ id: sampleObjectId }) },
      body: { reason: "Policy violation report" },
    }),
  },
  {
    name: "Admin Materials - Force Delete Material",
    path: "/api/admin/materials/:id",
    method: "DELETE",
    routeFile: "src/app/api/admin/materials/[id]/route.js",
    isMutatingAction: true,
    expectedAuditEvent: "material_force_deleted",
    buildPayload: () => ({
      context: { params: Promise.resolve({ id: sampleObjectId }) },
    }),
  },
];

// Helper to find all route.js files in src/app/api/admin
function findAdminRouteFiles(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...findAdminRouteFiles(fullPath));
    } else if (entry.name === "route.js") {
      files.push(fullPath);
    }
  }

  return files;
}

describe("Admin Authorization Matrix (Issue #1)", () => {
  let auditLogsEmitted = [];
  let originalConsoleInfo;

  before(async () => {
    process.env.MONGODB_URI = "mongodb://localhost:27017/test";
    globalThis._mongoClientPromise = Promise.resolve({
      db: () => createMockDb(),
      close: async () => {},
    });

    originalConsoleInfo = console.info;
    console.info = (...args) => {
      try {
        const parsed = JSON.parse(args[0]);
        if (parsed && parsed.event) {
          auditLogsEmitted.push(parsed);
        }
      } catch {}
    };

    // Stub refund service for on-chain interactions
    const { setRefundMockHandler } = await import("../../src/lib/stellar/refundService.js");
    setRefundMockHandler(async () => ({ success: true, hash: "0xmocktxhash" }));
  });

  beforeEach(() => {
    resetMockDbState();
    auditLogsEmitted = [];
  });

  after(() => {
    if (originalConsoleInfo) {
      console.info = originalConsoleInfo;
    }
  });

  describe("Dynamic Coverage & Discovery Guard", () => {
    it("every admin route and exported HTTP handler is covered by the matrix", async () => {
      const adminDir = path.join(rootDir, "src/app/api/admin");
      const routeFiles = findAdminRouteFiles(adminDir);
      const httpMethods = ["GET", "POST", "PATCH", "DELETE", "PUT"];

      for (const filePath of routeFiles) {
        const relativeRouteFile = path.relative(rootDir, filePath);
        const importedModule = await import(filePath);

        for (const method of httpMethods) {
          if (typeof importedModule[method] === "function") {
            const match = ADMIN_ROUTE_MATRIX.find(
              (entry) => entry.routeFile === relativeRouteFile && entry.method === method
            );

            assert.ok(
              match,
              `Missing admin test matrix entry for discovered handler: ${method} in ${relativeRouteFile}`
            );

            // Verify handler rejects request without auth
            const unauthenticatedReq = createMockRequest({
              url: `http://localhost:3000${match.path.replace(":id", sampleObjectId)}`,
              method,
              token: null,
            });

            const res = await importedModule[method](unauthenticatedReq, { params: Promise.resolve({ id: sampleObjectId }) });
            assert.equal(
              res.status,
              401,
              `Admin handler ${method} in ${relativeRouteFile} must reject unauthenticated requests with 401, got ${res.status}`
            );
          }
        }
      }
    });
  });

  describe("Endpoint Authorization Matrix Table", () => {
    for (const endpoint of ADMIN_ROUTE_MATRIX) {
      describe(`${endpoint.name} [${endpoint.method} ${endpoint.path}]`, () => {
        let routeModule;

        before(async () => {
          const absPath = path.resolve(rootDir, endpoint.routeFile);
          routeModule = await import(absPath);
        });

        it("asserts: no token -> 401", async () => {
          const payload = endpoint.buildPayload();
          const targetUrl = `http://localhost:3000${endpoint.path.replace(":id", sampleObjectId)}`;
          const req = createMockRequest({
            url: targetUrl,
            method: endpoint.method,
            token: null,
            body: payload.body,
          });

          const res = await routeModule[endpoint.method](req, payload.context);
          assert.equal(
            res.status,
            401,
            `Expected 401 Unauthorized when no token provided, got ${res.status}`
          );
        });

        it("asserts: non-admin token -> 403", async () => {
          const payload = endpoint.buildPayload();
          const targetUrl = `http://localhost:3000${endpoint.path.replace(":id", sampleObjectId)}`;
          const req = createMockRequest({
            url: targetUrl,
            method: endpoint.method,
            token: nonAdminToken,
            body: payload.body,
          });

          const res = await routeModule[endpoint.method](req, payload.context);
          assert.equal(
            res.status,
            403,
            `Expected 403 Forbidden for non-admin user, got ${res.status}`
          );
        });

        it("asserts: admin token -> 2xx", async () => {
          const payload = endpoint.buildPayload();
          const targetUrl = `http://localhost:3000${endpoint.path.replace(":id", sampleObjectId)}`;
          const req = createMockRequest({
            url: targetUrl,
            method: endpoint.method,
            token: adminToken,
            body: payload.body,
          });

          const res = await routeModule[endpoint.method](req, payload.context);
          assert.ok(
            res.status >= 200 && res.status < 300,
            `Expected 2xx response for admin token, got ${res.status}`
          );
        });

        if (endpoint.isMutatingAction) {
          it(`asserts audit log entry is written for admin action (${endpoint.expectedAuditEvent})`, async () => {
            const payload = endpoint.buildPayload();
            const targetUrl = `http://localhost:3000${endpoint.path.replace(":id", sampleObjectId)}`;
            const req = createMockRequest({
              url: targetUrl,
              method: endpoint.method,
              token: adminToken,
              body: payload.body,
            });

            await routeModule[endpoint.method](req, payload.context);

            const hasExpectedEvent = auditLogsEmitted.some(
              (entry) => entry.event === endpoint.expectedAuditEvent
            );

            assert.ok(
              hasExpectedEvent,
              `Expected audit log event '${endpoint.expectedAuditEvent}' was not emitted among: ${JSON.stringify(
                auditLogsEmitted
              )}`
            );
          });
        }
      });
    }
  });
});
