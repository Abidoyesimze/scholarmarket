/**
 * Tests for the Next.js proxy convention migration — Issue #114
 *
 * Verifies:
 *  1. src/proxy.js exists (file-structure guard).
 *  2. src/middleware.js has been removed.
 *  3. The proxy route matcher is unchanged.
 *  4. isProtectedDashboardPath still correctly classifies dashboard routes
 *     (same helper is used by proxy.js at runtime).
 *
 * Run with: npm run test:backend
 */

import assert from "node:assert/strict";
import { test, describe } from "node:test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "../..");

describe("Proxy convention migration (#114) — file structure", () => {
  test("src/proxy.js exists", () => {
    const proxyPath = path.join(rootDir, "src/proxy.js");
    assert.ok(fs.existsSync(proxyPath), "src/proxy.js should exist");
  });

  test("src/middleware.js has been removed", () => {
    const middlewarePath = path.join(rootDir, "src/middleware.js");
    assert.ok(
      !fs.existsSync(middlewarePath),
      "src/middleware.js should no longer exist after migration to proxy convention"
    );
  });

  test("proxy.js exports a function named 'proxy'", () => {
    const proxyPath = path.join(rootDir, "src/proxy.js");
    const content = fs.readFileSync(proxyPath, "utf-8");
    assert.ok(
      content.includes("export async function proxy"),
      "proxy.js should export 'proxy' function"
    );
  });

  test("proxy.js retains the /dashboard matcher", () => {
    const proxyPath = path.join(rootDir, "src/proxy.js");
    const content = fs.readFileSync(proxyPath, "utf-8");
    assert.ok(
      content.includes('"/dashboard/:path*"'),
      "proxy.js should match /dashboard/:path*"
    );
  });
});

describe("Proxy convention migration (#114) — auth logic", () => {
  test("isProtectedDashboardPath identifies protected routes", async () => {
    const { isProtectedDashboardPath } = await import(
      "../../src/lib/auth/session.js"
    );
    assert.equal(isProtectedDashboardPath("/dashboard"), true);
    assert.equal(isProtectedDashboardPath("/dashboard/upload"), true);
    assert.equal(isProtectedDashboardPath("/dashboard/analytics"), true);
    assert.equal(isProtectedDashboardPath("/marketplace"), false);
    assert.equal(isProtectedDashboardPath("/"), false);
  });
});

describe("CSRF Protection & Auth Cookie Audit (Issue #2)", () => {
  function makeMockRequest(url, {
    method = "GET",
    headers = {},
    cookies = {},
  } = {}) {
    const parsedUrl = new URL(url);
    const reqHeaders = new Headers(headers);

    const cookiePairs = Object.entries(cookies).map(
      ([k, v]) => `${k}=${encodeURIComponent(v)}`
    );
    if (cookiePairs.length > 0) {
      reqHeaders.set("cookie", cookiePairs.join("; "));
    }

    return {
      url,
      method,
      nextUrl: {
        pathname: parsedUrl.pathname,
        origin: parsedUrl.origin,
        host: parsedUrl.host,
      },
      headers: reqHeaders,
      cookies: {
        get: (name) => (cookies[name] !== undefined ? { value: cookies[name] } : undefined),
      },
    };
  }

  test("rejects cross-origin form POST to a mutating route with 403", async () => {
    const { proxy } = await import("../../src/proxy.js");

    const req = makeMockRequest("http://localhost:3000/api/admin/users/suspend", {
      method: "POST",
      headers: {
        origin: "https://malicious-attacker.com",
        "content-type": "application/x-www-form-urlencoded",
        host: "localhost:3000",
      },
    });

    const res = await proxy(req);
    assert.ok(res, "Should return a response");
    assert.equal(res.status, 403);
    const body = await res.json();
    assert.match(body.error, /Forbidden: Cross-site request rejected/i);
  });

  test("rejects mutating request with Sec-Fetch-Site: cross-site with 403", async () => {
    const { proxy } = await import("../../src/proxy.js");

    const req = makeMockRequest("http://localhost:3000/api/checkout/initiate", {
      method: "POST",
      headers: {
        "sec-fetch-site": "cross-site",
        host: "localhost:3000",
      },
    });

    const res = await proxy(req);
    assert.ok(res);
    assert.equal(res.status, 403);
  });

  test("allows same-origin mutating requests", async () => {
    const { proxy } = await import("../../src/proxy.js");

    const req = makeMockRequest("http://localhost:3000/api/market-materials", {
      method: "POST",
      headers: {
        origin: "http://localhost:3000",
        "sec-fetch-site": "same-origin",
        host: "localhost:3000",
      },
    });

    const res = await proxy(req);
    // When allowed and not rate-limited, NextResponse.next() is returned (status 200 or no error)
    assert.ok(res.status !== 403);
  });

  test("enforces double-submit CSRF token on sensitive mutating routes when cookie-authenticated", async () => {
    const { proxy } = await import("../../src/proxy.js");

    // Mismatched token -> 403
    const reqMismatched = makeMockRequest("http://localhost:3000/api/admin/users/suspend", {
      method: "POST",
      headers: {
        origin: "http://localhost:3000",
        "x-csrf-token": "wrong-token",
        host: "localhost:3000",
      },
      cookies: {
        auth_token: "mock-jwt-token",
        csrf_token: "expected-csrf-token-12345",
      },
    });

    const resMismatched = await proxy(reqMismatched);
    assert.equal(resMismatched.status, 403);

    // Matching token -> allowed
    const reqMatching = makeMockRequest("http://localhost:3000/api/admin/users/suspend", {
      method: "POST",
      headers: {
        origin: "http://localhost:3000",
        "x-csrf-token": "valid-csrf-token-99999",
        host: "localhost:3000",
      },
      cookies: {
        auth_token: "mock-jwt-token",
        csrf_token: "valid-csrf-token-99999",
      },
    });

    const resMatching = await proxy(reqMatching);
    assert.ok(resMatching.status !== 403);
  });

  test("apiClient sends x-csrf-token header from document cookie", async () => {
    const { apiClient } = await import("../../src/lib/api/apiClient.js");

    // Mock document.cookie
    globalThis.document = {
      cookie: "csrf_token=client-test-csrf-token-abc; theme=dark",
    };

    let capturedHeaders = null;
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (url, config) => {
      capturedHeaders = config.headers;
      return {
        ok: true,
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => ({ success: true }),
      };
    };

    try {
      await apiClient("/api/test-endpoint", { body: { test: true } });
      assert.ok(capturedHeaders);
      assert.equal(capturedHeaders["x-csrf-token"], "client-test-csrf-token-abc");
    } finally {
      globalThis.fetch = originalFetch;
      delete globalThis.document;
    }
  });
});
