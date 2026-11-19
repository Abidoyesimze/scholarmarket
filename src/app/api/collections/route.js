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

        let payload;
        try {
          payload = await request.json();
        } catch {
          return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
        }
        const title =
          typeof payload?.title === "string"
            ? payload.title.replace(/[\u0000-\u001F\u007F]/g, "").trim().slice(0, 120)
            : "";
        const description =
          typeof payload?.description === "string"
            ? payload.description.replace(/[\u0000-\u001F\u007F]/g, "").trim().slice(0, 2000)
            : "";
        if (!title) return NextResponse.json({ error: "Title is required" }, { status: 400 });
        if (!Array.isArray(payload.materialIds)) return NextResponse.json({ error: "materialIds must be an array" }, { status: 400 });
        const db = await getDb();

        const doc = {
          title,
          description,
          creatorId: user.sub,
          materialIds: payload.materialIds.slice(0, 500).map((id) => String(id).slice(0, 100)),
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
        const user = await getUserFromCookie(request);
        if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

        const db = await getDb();
        const items = await db
          .collection("collections")
          .find({ creatorId: user.sub })
          .sort({ createdAt: -1 })
          .toArray();

        return NextResponse.json(items);
      } catch (err) {
        return NextResponse.json({ error: "Server error" }, { status: 500 });
      }
    }
  );
}
