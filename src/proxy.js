/**
 * Route protection proxy — Next.js 16+ convention.
 *
 * Replaces the deprecated `src/middleware.js` convention.
 * Handles both rate limiting for API routes and auth protection
 * for dashboard routes.
 */
import { NextResponse } from "next/server.js";
import { isProtectedDashboardPath, verifyDashboardToken } from "./lib/auth/session.js";
import { logger } from "./lib/logger.js";
import { slidingWindowRateLimit } from "./lib/rateLimit.js";
import crypto from "crypto";

/**
 * Mutating HTTP methods that must be protected against CSRF attacks.
 */
const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/**
 * Sensitive API routes requiring double-submit CSRF verification when cookie-authenticated.
 */
const SENSITIVE_ROUTE_PATTERN = /^\/api\/(admin|checkout|materials\/upload|users|verification)(\/|$)/;

function isSameOrigin(request) {
  const secFetchSite = request.headers.get("sec-fetch-site");
  if (secFetchSite && secFetchSite.toLowerCase() === "cross-site") {
    return false;
  }

  const origin = request.headers.get("origin");
  if (origin) {
    try {
      const originUrl = new URL(origin);
      const hostHeader = request.headers.get("x-forwarded-host") || request.headers.get("host") || request.nextUrl.host;
      const expectedHost = hostHeader.split(":")[0];
      const originHost = originUrl.hostname;

      if (originUrl.origin === request.nextUrl.origin) {
        return true;
      }

      if (originHost === expectedHost || originUrl.host === hostHeader) {
        return true;
      }

      // Allow localhost & 127.0.0.1 interoperability in development/test
      if (process.env.NODE_ENV !== "production") {
        const isLocalOrigin = originHost === "localhost" || originHost === "127.0.0.1";
        const isLocalHost = expectedHost === "localhost" || expectedHost === "127.0.0.1";
        if (isLocalOrigin && isLocalHost) {
          return true;
        }
      }

      return false;
    } catch {
      return false;
    }
  }

  // If no Origin header, check Referer if present
  const referer = request.headers.get("referer");
  if (referer) {
    try {
      const refererUrl = new URL(referer);
      const hostHeader = request.headers.get("x-forwarded-host") || request.headers.get("host") || request.nextUrl.host;
      const expectedHost = hostHeader.split(":")[0];
      if (refererUrl.origin === request.nextUrl.origin || refererUrl.hostname === expectedHost) {
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }

  return true;
}

/**
 * Validates CSRF protection for API mutating requests:
 * 1. Verifies Origin / Sec-Fetch-Site to reject cross-site mutating requests with 403.
 * 2. Enforces double-submit CSRF token for sensitive routes when cookie-authenticated.
 */
function verifyCsrf(request) {
  const { pathname } = request.nextUrl;
  const method = request.method.toUpperCase();

  if (!pathname.startsWith("/api/") || !MUTATING_METHODS.has(method)) {
    return null;
  }

  // 1. Verify Origin and Sec-Fetch-Site
  if (!isSameOrigin(request)) {
    logger.warn({
      event: "csrf_cross_origin_rejected",
      method,
      pathname,
      origin: request.headers.get("origin"),
      secFetchSite: request.headers.get("sec-fetch-site"),
    }, "Cross-site mutating request rejected");

    return NextResponse.json(
      { error: "Forbidden: Cross-site request rejected" },
      { status: 403 }
    );
  }

  // 2. Double-submit CSRF token validation for sensitive routes when using cookie authentication
  const authToken = request.cookies.get("auth_token")?.value;
  const isSensitive = SENSITIVE_ROUTE_PATTERN.test(pathname);

  if (authToken && isSensitive) {
    const csrfCookie = request.cookies.get("csrf_token")?.value;
    const csrfHeader = request.headers.get("x-csrf-token");

    if (!csrfCookie || !csrfHeader || csrfCookie !== csrfHeader) {
      logger.warn({
        event: "csrf_double_submit_failed",
        method,
        pathname,
        hasCookie: Boolean(csrfCookie),
        hasHeader: Boolean(csrfHeader),
      }, "Double-submit CSRF verification failed");

      return NextResponse.json(
        { error: "Forbidden: Invalid or missing CSRF token" },
        { status: 403 }
      );
    }
  }

  return null;
}

/**
 * Per-route rate limit rules.
 */
const RATE_LIMIT_RULES = [
  {
    pattern: /^\/api\/(market-materials|subjects)(\/|$)/,
    limit: 100,
    windowMs: 60_000,
    label: "marketplace",
  },
  {
    pattern: /^\/api\/(upload|creator\/materials)(\/|$)/,
    limit: 5,
    windowMs: 60 * 60_000,
    label: "upload",
  },
  {
    pattern: /^\/api\/auth\//,
    limit: 20,
    windowMs: 60_000,
    label: "auth",
  },
];

function clientIp(request) {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "anonymous"
  );
}

function applyRateLimiting(request) {
  const { pathname } = request.nextUrl;
  const ip = clientIp(request);

  for (const rule of RATE_LIMIT_RULES) {
    if (!rule.pattern.test(pathname)) continue;

    const result = slidingWindowRateLimit(`${rule.label}:${ip}`, {
      limit: rule.limit,
      windowMs: rule.windowMs,
    });

    const rateLimitHeaders = {
      "X-RateLimit-Limit": String(result.limit),
      "X-RateLimit-Remaining": String(result.remaining),
      "X-RateLimit-Reset": String(result.resetAt),
    };

    if (!result.allowed) {
      return new NextResponse(
        JSON.stringify({
          type: "about:blank",
          title: "Too Many Requests",
          status: 429,
          detail: `Rate limit exceeded. Please retry after ${result.retryAfter} seconds.`,
          instance: pathname,
        }),
        {
          status: 429,
          headers: {
            "Content-Type": "application/problem+json",
            "Retry-After": String(result.retryAfter),
            ...rateLimitHeaders,
          },
        }
      );
    }

    // Pass through with rate limit info headers
    const response = NextResponse.next();
    Object.entries(rateLimitHeaders).forEach(([k, v]) => response.headers.set(k, v));
    return response;
  }

  return null;
}

export async function proxy(req) {
  // ── Rate limiting for API routes ────────────────────────────────────────
  const rateLimitResponse = applyRateLimiting(req);
  if (rateLimitResponse) return rateLimitResponse;

  // ── CSRF protection for mutating API routes ─────────────────────────────
  const csrfResponse = verifyCsrf(req);
  if (csrfResponse) return csrfResponse;

  // ── Dashboard auth protection ───────────────────────────────────────────
  const token = req.cookies.get("auth_token")?.value;
  const { pathname } = req.nextUrl;

  logger.info({
    method: req.method,
    url: req.url,
    pathname,
    timestamp: new Date().toISOString()
  }, 'Incoming request');

  if (!isProtectedDashboardPath(pathname)) {
    const response = NextResponse.next();
    if (!req.cookies.get("csrf_token")) {
      const csrfToken = crypto.randomUUID ? crypto.randomUUID().replace(/-/g, "") : crypto.randomBytes(16).toString("hex");
      response.cookies.set("csrf_token", csrfToken, {
        path: "/",
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production" || process.env.NODE_ENV === "test",
        httpOnly: false,
      });
    }
    return response;
  }

  const secret = process.env.JWT_SECRET;
  if (!token || !secret) {
    const url = new URL("/", req.url);
    return NextResponse.redirect(url);
  }

  const verification = await verifyDashboardToken(token, secret);
  if (!verification.valid) {
    const url = new URL("/", req.url);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*", "/api/:path*"],
};
