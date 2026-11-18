export const API_RATE_LIMITS = Object.freeze({
  "/api/checkout/initiate": { limit: 20, windowMs: 60_000 },
  "/api/checkout/verify": { limit: 20, windowMs: 60_000 },
  "/api/checkout/refund": { limit: 10, windowMs: 60_000 },
  "/api/checkout/verify-promo": { limit: 5, windowMs: 60_000 },
  "/api/purchase": { limit: 20, windowMs: 60_000 },
  "/api/entitlements": { limit: 30, windowMs: 60_000 },
  "/api/entitlements/batch": { limit: 15, windowMs: 60_000 },
  "/api/download": { limit: 30, windowMs: 60_000 },
  "/api/transactions/history": { limit: 30, windowMs: 60_000 },
  "/api/verification/student": { limit: 10, windowMs: 60_000 },
});
