import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { test } from "node:test";

import { getUserFromCookie } from "../../src/lib/api/auth.js";
import { verifyAdminAuth } from "../../src/lib/auth/adminAuth.js";

const secret = "api-auth-test-secret";

function base64UrlEncode(value) {
  return Buffer.from(value).toString("base64url");
}

function signJwt(payload, signingSecret, exp) {
  const header = base64UrlEncode(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = base64UrlEncode(JSON.stringify({ ...payload, exp }));
  const signature = createHmac("sha256", signingSecret)
    .update(`${header}.${body}`)
    .digest("base64url");
  return `${header}.${body}.${signature}`;
}

function requestWithToken(token) {
  const headers = new Headers();
  if (token) headers.set("cookie", `theme=dark; auth_token=${encodeURIComponent(token)}; sidebar=closed`);
  return new Request("http://localhost/api/test", { headers });
}

test("shared auth rejects a missing token", async () => {
  process.env.JWT_SECRET = secret;
  assert.equal(await getUserFromCookie(requestWithToken(null)), null);
});

test("shared auth rejects malformed tokens", async () => {
  process.env.JWT_SECRET = secret;
  assert.equal(await getUserFromCookie(requestWithToken("not-a-jwt")), null);
});

test("shared auth rejects expired tokens", async () => {
  process.env.JWT_SECRET = secret;
  const token = signJwt({ sub: "user-1" }, secret, Math.floor(Date.now() / 1000) - 10);
  assert.equal(await getUserFromCookie(requestWithToken(token)), null);
});

test("shared auth accepts a valid token", async () => {
  process.env.JWT_SECRET = secret;
  const exp = Math.floor(Date.now() / 1000) + 3600;
  const token = signJwt({ sub: "user-1", role: "user" }, secret, exp);
  assert.deepEqual(await getUserFromCookie(requestWithToken(token)), {
    sub: "user-1",
    role: "user",
    exp,
  });
});

test("verifyAdminAuth rejects missing and expired admin tokens", async () => {
  process.env.JWT_SECRET = secret;
  const missing = await verifyAdminAuth(requestWithToken(null));
  assert.equal(missing.authorized, false);
  assert.equal(missing.status, 403);

  const expired = signJwt({ sub: "admin-1", role: "admin" }, secret, Math.floor(Date.now() / 1000) - 10);
  const rejected = await verifyAdminAuth(requestWithToken(expired));
  assert.equal(rejected.authorized, false);
  assert.equal(rejected.status, 403);
});
