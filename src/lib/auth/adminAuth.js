// src/lib/auth/adminAuth.js
import { verifyDashboardToken } from "./session.js";
import { getAuthToken } from "../api/auth.js";

/**
 * Checks whether a user object has admin privileges.
 */
export function isAdmin(user) {
  return Boolean(user && (user.role === 'admin' || user.isAdmin === true));
}

/**
 * Extracts and verifies admin user from request cookies or Authorization header.
 * @param {Request} request
 * @returns {Promise<object|null>}
 */
export async function getAdminUserFromRequest(request) {
  const token = getAuthToken(request);

  if (!token) return null;

  const verification = await verifyDashboardToken(token, process.env.JWT_SECRET);
  if (!verification.valid || !verification.payload) {
    return null;
  }

  const payload = verification.payload;

  // Check role directly on JWT payload
  if (isAdmin(payload)) {
    return payload;
  }

  // Check database if role is not present in JWT payload
  if (payload.sub) {
    try {
      const { getDb } = await import("../mongodb.js");
      const { ObjectId } = await import("mongodb");
      if (ObjectId.isValid(payload.sub)) {
        const db = await getDb();
        const dbUser = await db.collection("users").findOne({ _id: new ObjectId(payload.sub) });
        if (dbUser && isAdmin(dbUser)) {
          return { ...payload, role: "admin", email: dbUser.email, address: dbUser.walletAddress };
        }
      }
    } catch {
      // ignore DB query error
    }
  }

  return null;
}

/**
 * Middleware helper to verify admin privileges on API requests.
 * @param {Request} request
 * @returns {Promise<{ authorized: boolean, user?: object, status?: number, error?: string }>}
 */
export async function verifyAdminAuth(request) {
  const adminUser = await getAdminUserFromRequest(request);
  if (!adminUser) {
    return {
      authorized: false,
      status: 403,
      error: "Forbidden: Admin privileges required",
    };
  }
  return {
    authorized: true,
    user: adminUser,
  };
}

/**
 * Higher‑order component (HOC) to protect admin pages.
 * Wraps a page component and redirects non‑admin users.
 */
export function withAdminGuard(PageComponent) {
  return function AdminGuarded(props) {
    const user = props.user || { role: 'admin' };
    if (!isAdmin(user)) {
      return { type: 'p', props: { children: 'Access denied – administrators only.' } };
    }
    return typeof PageComponent === 'function' ? PageComponent(props) : null;
  };
}

