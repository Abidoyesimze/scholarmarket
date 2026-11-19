import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { getDb } from "@/lib/mongodb";
import { getUserFromCookie, sanitizeString } from "@/lib/api/auth";
import { withApiHardening } from "@/lib/api/hardening";

export const runtime = "nodejs";

const DEFAULTS = {
  receipts: true,
  reviews: true,
  sales: true,
  reminders: true,
  productUpdates: true,
};

function preferencesFor(payload) {
  return {
    receipts: true,
    reviews: payload.reviews === undefined ? DEFAULTS.reviews : Boolean(payload.reviews),
    sales: payload.sales === undefined ? DEFAULTS.sales : Boolean(payload.sales),
    reminders: payload.reminders === undefined ? DEFAULTS.reminders : Boolean(payload.reminders),
    productUpdates: payload.productUpdates === undefined ? DEFAULTS.productUpdates : Boolean(payload.productUpdates),
  };
}

async function getUserDocument(db, user) {
  const query = ObjectId.isValid(user?.sub) ? { _id: new ObjectId(user.sub) } : null;
  if (query) return db.collection("users").findOne(query);
  if (user?.walletAddress || user?.address) {
    return db.collection("users").findOne({ walletAddress: user.walletAddress || user.address });
  }
  return null;
}

export async function GET(request) {
  return withApiHardening(request, { route: "notification_preferences", rateLimit: { limit: 60, windowMs: 60_000 } }, async () => {
    const user = await getUserFromCookie(request);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    try {
      const db = await getDb();
      const doc = await getUserDocument(db, user);
      if (!doc) return NextResponse.json({ error: "User not found" }, { status: 404 });
      const preferences = { ...DEFAULTS, ...(doc.notificationPreferences || {}) };
      preferences.receipts = true;
      return NextResponse.json({ preferences, updatedAt: doc.notificationPreferencesUpdatedAt || null });
    } catch {
      return NextResponse.json({ error: "Server error" }, { status: 500 });
    }
  });
}

export async function PUT(request) {
  return withApiHardening(request, { route: "notification_preferences", rateLimit: { limit: 30, windowMs: 60_000 } }, async () => {
    const user = await getUserFromCookie(request);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    let body;
    try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
    if (!body || typeof body !== "object") return NextResponse.json({ error: "Invalid preferences" }, { status: 400 });

    const preferences = preferencesFor(body);
    try {
      const db = await getDb();
      const doc = await getUserDocument(db, user);
      if (!doc) return NextResponse.json({ error: "User not found" }, { status: 404 });
      const updatedAt = new Date();
      await db.collection("users").updateOne({ _id: doc._id }, { $set: { notificationPreferences: preferences, notificationPreferencesUpdatedAt: updatedAt } });
      return NextResponse.json({ preferences, updatedAt: updatedAt.toISOString() });
    } catch {
      return NextResponse.json({ error: "Server error" }, { status: 500 });
    }
  });
}
