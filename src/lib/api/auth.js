import { verifyDashboardToken } from "../auth/session.js";
import { ObjectId } from "mongodb";
import { getDb } from "../mongodb.js";

export function getAuthToken(request) {
  const cookieHeader = request.headers.get("cookie") || "";
  const cookieMatch = cookieHeader.match(/(?:^|;\s*)auth_token=([^;]+)/);
  if (cookieMatch) {
    try {
      return decodeURIComponent(cookieMatch[1]);
    } catch {
      return null;
    }
  }

  const authorization = request.headers.get("authorization") || "";
  if (authorization.toLowerCase().startsWith("bearer ")) {
    return authorization.slice(7).trim() || null;
  }

  return null;
}

export async function getUserFromCookie(request) {
  const token = getAuthToken(request);
  if (!token) return null;
  const verification = await verifyDashboardToken(token, process.env.JWT_SECRET);
  if (!verification.valid) {
    return null;
  }
  return verification.payload;
}

export async function getFullUserFromCookie(request) {
  const payload = await getUserFromCookie(request);
  if (!payload || !payload.sub) return null;

  try {
    const db = await getDb();
    const users = db.collection("users");
    return users.findOne({ _id: new ObjectId(payload.sub) });
  } catch {
    return null;
  }
}

export function sanitizeString(value, { maxLength = 5000 } = {}) {
  if (value === undefined || value === null) return "";
  return String(value).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").trim().slice(0, maxLength);
}
