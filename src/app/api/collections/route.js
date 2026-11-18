import { NextResponse } from "next/server";
import { withApiHardening } from "@/lib/api/hardening";
import { getDb } from "@/lib/mongodb";
import { ObjectId } from "mongodb";
import { getUserFromCookie } from "@/lib/api/auth";

export const runtime = "nodejs";

export async function POST(request) {
  return withApiHardening(
    request,
    { route: "collections", rateLimit: { limit: 40, windowMs: 60_000 } },
    async () => {
      try {
        const user = await getUserFromCookie(request);
        if (!user) {
          return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const payload = await request.json();
        const db = await getDb();

        const doc = {
          title: payload.title,
          description: payload.description,
          creatorId: user.sub,
          materialIds: payload.materialIds || [], // Array of material ObjectId strings or similar
          createdAt: new Date(),
          updatedAt: new Date(),
        };

        const result = await db.collection("collections").insertOne(doc);
        return NextResponse.json({ id: result.insertedId, ...doc }, { status: 201 });
      } catch (err) {
        return NextResponse.json({ error: "Server error" }, { status: 500 });
      }
    }
  );
}

export async function GET(request) {
  return withApiHardening(
    request,
    { route: "collections", rateLimit: { limit: 80, windowMs: 60_000 } },
    async () => {
      try {
        const db = await getDb();
        const items = await db
          .collection("collections")
          .find({})
          .sort({ createdAt: -1 })
          .toArray();

        return NextResponse.json(items);
      } catch (err) {
        return NextResponse.json({ error: "Server error" }, { status: 500 });
      }
    }
  );
}
