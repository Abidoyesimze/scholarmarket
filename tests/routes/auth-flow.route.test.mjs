/**
 * Auth Flow Integration Tests
 *
 * Verifies that each step in the authentication flow functions together as a cohesive contract:
 *  1. Request a challenge via GET /api/auth/challenge
 *  2. Sign challenge with Stellar keypair and verify via POST /api/auth/verify
 *  3. Assert cookie attributes (HttpOnly, Secure, SameSite, Path) on auth_token and refresh_token
 *  4. Refresh via POST /api/auth/refresh and assert token rotation (new family member, old invalidated)
 *  5. Logout via POST /api/auth/logout and assert refresh token is revoked and cookies expired
 *  6. Assert using old refresh token after logout fails (401)
 */

import assert from "node:assert/strict";
import { describe, it, before, after } from "node:test";
import { MongoMemoryServer } from "mongodb-memory-server";
import {
  Keypair,
  Networks,
  Memo,
  Operation,
  TransactionBuilder,
} from "@stellar/stellar-sdk";
import { register } from "node:module";

try {
  register("../../test/alias-loader.mjs", import.meta.url);
} catch {}

let mongo;
let getDb;
let challengeRoute;
let verifyRoute;
let refreshRoute;
let logoutRoute;

function signChallenge(keypair, nonce, source = keypair.publicKey()) {
  const account = {
    accountId: () => source,
    sequence: "0",
    sequenceNumber: () => "0",
    incrementSequenceNumber: function () {
      this.sequence = "1";
    },
  };

  const tx = new TransactionBuilder(account, {
    networkPassphrase: Networks.TESTNET,
    fee: "100",
  })
    .addOperation(Operation.manageData({ name: "wallet_challenge", value: nonce }))
    .setTimeout(30)
    .addMemo(Memo.text(nonce))
    .build();

  tx.sign(keypair);
  return tx.toXDR();
}

function createRequest(url, { method = "GET", headers = {}, body = null } = {}) {
  const reqHeaders = new Headers(headers);
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

describe("Authentication Flow Integration (Issue #3)", () => {
  before(async () => {
    mongo = await MongoMemoryServer.create();
    process.env.MONGODB_URI = mongo.getUri();
    process.env.MONGODB_DB = "scholarmarket_authflow_integration";
    process.env.JWT_SECRET = "auth-flow-test-jwt-secret-key-at-least-32chars";

    // Clear any previous mongo connection
    if (globalThis._mongoClientPromise) {
      try {
        const client = await globalThis._mongoClientPromise;
        await client.close();
      } catch {}
      globalThis._mongoClientPromise = null;
    }

    const mongoModule = await import("../../src/lib/mongodb.js");
    getDb = mongoModule.getDb;

    challengeRoute = await import("../../src/app/api/auth/challenge/route.js");
    verifyRoute = await import("../../src/app/api/auth/verify/route.js");
    refreshRoute = await import("../../src/app/api/auth/refresh/route.js");
    logoutRoute = await import("../../src/app/api/auth/logout/route.js");
  });

  after(async () => {
    if (globalThis._mongoClientPromise) {
      try {
        const client = await globalThis._mongoClientPromise;
        await client.close();
        globalThis._mongoClientPromise = null;
      } catch {}
    }
    if (mongo) {
      await mongo.stop();
    }
  });

  it("completes full auth flow in a single coordinated test and prevents replay / post-logout refresh", async () => {
    // ── STEP 1: Generate Stellar Keypair and Request Challenge ─────────────
    const keypair = Keypair.random();
    const address = keypair.publicKey();

    const challengeReq = createRequest(
      `http://localhost:3000/api/auth/challenge?address=${encodeURIComponent(address)}`
    );
    const challengeRes = await challengeRoute.GET(challengeReq);

    assert.equal(challengeRes.status, 200, "Challenge request must succeed with 200");
    const challengeData = await challengeRes.json();
    assert.ok(challengeData.nonce, "Challenge response must contain nonce");
    assert.equal(challengeData.address, address);

    // ── STEP 2: Sign Challenge and Verify ──────────────────────────────────
    const signedXdr = signChallenge(keypair, challengeData.nonce);
    const verifyReq = createRequest("http://localhost:3000/api/auth/verify", {
      method: "POST",
      body: {
        address,
        nonce: challengeData.nonce,
        signedTransactionXdr: signedXdr,
      },
    });

    const verifyRes = await verifyRoute.POST(verifyReq);
    assert.equal(verifyRes.status, 200, "Verification must succeed with 200");
    const verifyData = await verifyRes.json();
    assert.equal(verifyData.success, true);

    // ── STEP 3: Assert Cookie Attributes (HttpOnly, Secure, SameSite) ──────
    const authTokenCookie = verifyRes.cookies.get("auth_token");
    const refreshTokenCookie = verifyRes.cookies.get("refresh_token");

    assert.ok(authTokenCookie, "auth_token cookie must be set");
    assert.ok(refreshTokenCookie, "refresh_token cookie must be set");

    // Verify auth_token attributes
    assert.equal(authTokenCookie.httpOnly, true, "auth_token must be HttpOnly");
    assert.equal(authTokenCookie.secure, true, "auth_token must be Secure");
    assert.ok(
      ["strict", "lax"].includes(authTokenCookie.sameSite?.toLowerCase()),
      `auth_token sameSite must be Lax or stricter, got ${authTokenCookie.sameSite}`
    );
    assert.equal(authTokenCookie.path, "/", "auth_token path must be /");

    // Verify refresh_token attributes
    assert.equal(refreshTokenCookie.httpOnly, true, "refresh_token must be HttpOnly");
    assert.equal(refreshTokenCookie.secure, true, "refresh_token must be Secure");
    assert.ok(
      ["strict", "lax"].includes(refreshTokenCookie.sameSite?.toLowerCase()),
      `refresh_token sameSite must be Lax or stricter, got ${refreshTokenCookie.sameSite}`
    );
    assert.equal(refreshTokenCookie.path, "/api/auth/refresh", "refresh_token path must be /api/auth/refresh");

    const initialAccessToken = authTokenCookie.value;
    const initialRefreshToken = refreshTokenCookie.value;

    assert.ok(initialAccessToken && initialAccessToken.length > 20);
    assert.ok(initialRefreshToken && initialRefreshToken.length > 20);

    // ── STEP 4: Refresh and Assert Rotation ────────────────────────────────
    const refreshReq = createRequest("http://localhost:3000/api/auth/refresh", {
      method: "POST",
      headers: {
        cookie: `refresh_token=${encodeURIComponent(initialRefreshToken)}`,
      },
      body: { action: "default" },
    });

    const refreshRes = await refreshRoute.POST(refreshReq);
    assert.equal(refreshRes.status, 200, "Token refresh must succeed with 200");
    const refreshData = await refreshRes.json();
    assert.equal(refreshData.success, true);

    const rotatedAuthCookie = refreshRes.cookies.get("auth_token");
    const rotatedRefreshCookie = refreshRes.cookies.get("refresh_token");

    assert.ok(rotatedAuthCookie, "Rotated auth_token cookie must be set");
    assert.ok(rotatedRefreshCookie, "Rotated refresh_token cookie must be set");

    const rotatedAccessToken = rotatedAuthCookie.value;
    const rotatedRefreshToken = rotatedRefreshCookie.value;

    assert.notEqual(
      rotatedRefreshToken,
      initialRefreshToken,
      "Refresh token must rotate to a new distinct value"
    );

    // Assert rotated cookie security attributes
    assert.equal(rotatedAuthCookie.httpOnly, true);
    assert.equal(rotatedAuthCookie.secure, true);
    assert.equal(rotatedRefreshCookie.httpOnly, true);
    assert.equal(rotatedRefreshCookie.secure, true);

    // Assert reuse of consumed initial refresh token is rejected
    const replayReq = createRequest("http://localhost:3000/api/auth/refresh", {
      method: "POST",
      headers: {
        cookie: `refresh_token=${encodeURIComponent(initialRefreshToken)}`,
      },
      body: { action: "default" },
    });
    const replayRes = await refreshRoute.POST(replayReq);
    assert.equal(
      replayRes.status,
      401,
      "Reusing already rotated refresh token must fail with 401"
    );

    // ── STEP 5: Logout and Assert Revocation ────────────────────────────────
    const logoutReq = createRequest("http://localhost:3000/api/auth/logout", {
      method: "POST",
      headers: {
        cookie: `auth_token=${encodeURIComponent(rotatedAccessToken)}; refresh_token=${encodeURIComponent(rotatedRefreshToken)}`,
      },
    });

    const logoutRes = await logoutRoute.POST(logoutReq);
    assert.equal(logoutRes.status, 200, "Logout must succeed with 200");
    const logoutData = await logoutRes.json();
    assert.equal(logoutData.success, true);

    // Assert cookies are cleared / expired (maxAge === 0)
    const clearedAuthCookie = logoutRes.cookies.get("auth_token");
    const clearedRefreshCookie = logoutRes.cookies.get("refresh_token");

    assert.ok(clearedAuthCookie, "Logout must set auth_token expiration");
    assert.ok(clearedRefreshCookie, "Logout must set refresh_token expiration");
    assert.equal(clearedAuthCookie.maxAge, 0, "auth_token maxAge must be 0 on logout");
    assert.equal(clearedRefreshCookie.maxAge, 0, "refresh_token maxAge must be 0 on logout");

    // Assert tokens in database are deleted/revoked
    const db = await getDb();
    const remainingTokens = await db.collection("refresh_tokens").find({
      token: { $in: [initialRefreshToken, rotatedRefreshToken] },
    }).toArray();

    assert.equal(
      remainingTokens.length,
      0,
      "Refresh tokens must be deleted from database upon logout"
    );

    // ── STEP 6: Assert Using Old / Rotated Token After Logout Fails ────────
    const postLogoutRefreshRotated = createRequest("http://localhost:3000/api/auth/refresh", {
      method: "POST",
      headers: {
        cookie: `refresh_token=${encodeURIComponent(rotatedRefreshToken)}`,
      },
      body: { action: "default" },
    });
    const postLogoutResRotated = await refreshRoute.POST(postLogoutRefreshRotated);
    assert.equal(
      postLogoutResRotated.status,
      401,
      "Using the rotated refresh token after logout must fail with 401"
    );

    const postLogoutRefreshOld = createRequest("http://localhost:3000/api/auth/refresh", {
      method: "POST",
      headers: {
        cookie: `refresh_token=${encodeURIComponent(initialRefreshToken)}`,
      },
      body: { action: "default" },
    });
    const postLogoutResOld = await refreshRoute.POST(postLogoutRefreshOld);
    assert.equal(
      postLogoutResOld.status,
      401,
      "Using old refresh token after logout must fail with 401"
    );
  });
});
