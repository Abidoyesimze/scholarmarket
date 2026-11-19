import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { getDb } from "@/lib/mongodb";
import { verifyAdminAuth } from "@/lib/auth/adminAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isSuperAdmin(user) {
  return Boolean(user?.isSuperAdmin || user?.superAdmin || ["super_admin", "superadmin"].includes(user?.role));
}

function csvEscape(value) {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

export async function GET(request) {
  const auth = await verifyAdminAuth(request);
  if (!auth.authorized) return NextResponse.json({ error: auth.error }, { status: auth.status });
  if (!isSuperAdmin(auth.user)) return NextResponse.json({ error: "Forbidden: Super admin privileges required" }, { status: 403 });

  try {
    const url = new URL(request.url);
    const actor = url.searchParams.get("actor")?.trim().slice(0, 300);
    const action = url.searchParams.get("action")?.trim().slice(0, 300);
    const target = url.searchParams.get("target")?.trim().slice(0, 300);
    const from = url.searchParams.get("from") ? new Date(url.searchParams.get("from")) : null;
    const to = url.searchParams.get("to") ? new Date(url.searchParams.get("to")) : null;
    const limit = Math.min(Math.max(parseInt(url.searchParams.get("limit") || "50", 10) || 50, 1), 200);
    const cursor = url.searchParams.get("cursor")?.trim();
    const exportCsv = url.searchParams.get("export") === "csv";

    if ((from && Number.isNaN(from.getTime())) || (to && Number.isNaN(to.getTime()))) {
      return NextResponse.json({ error: "Invalid date range" }, { status: 400 });
    }
    if (from && to && from > to) return NextResponse.json({ error: "Invalid date range" }, { status: 400 });

    const query = {};
    if (actor) query.actor = { $regex: actor.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&"), $options: "i" };
    if (action) query.action = { $regex: action.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&"), $options: "i" };
    if (target) query.target = { $regex: target.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&"), $options: "i" };
    if (from || to) {
      query.createdAt = {};
      if (from) query.createdAt.$gte = from;
      if (to) query.createdAt.$lte = to;
    }
    if (cursor) {
      if (!ObjectId.isValid(cursor)) return NextResponse.json({ error: "Invalid cursor" }, { status: 400 });
      query._id = { ...(query._id || {}), $lt: new ObjectId(cursor) };
    }

    const db = await getDb();
    const collection = db.collection("audit_logs");

    if (exportCsv) {
      const rows = await collection.find(query).sort({ _id: -1 }).toArray();
      const headers = ["ID", "Timestamp", "Actor", "Action", "Target", "Route", "Method", "Status", "Reason"];
      const csv = [headers.map(csvEscape).join(",")];
      for (const row of rows) {
        csv.push([row._id, row.createdAt || row.timestamp, row.actor, row.action || row.event, row.target, row.route, row.method, row.status, row.reason].map(csvEscape).join(","));
      }
      return new NextResponse(csv.join("\n"), {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="scholarmarket-audit-${new Date().toISOString().slice(0, 10)}.csv"`,
        },
      });
    }

    const rows = await collection.find(query).sort({ _id: -1 }).limit(limit + 1).toArray();
    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    const nextCursor = hasMore ? String(page[page.length - 1]._id) : null;

    return NextResponse.json({ items: page, nextCursor, hasMore });
  } catch (error) {
    return NextResponse.json({ error: "Unable to retrieve audit entries" }, { status: 500 });
  }
}
