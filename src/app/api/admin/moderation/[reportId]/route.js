export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { auditLog } from "@/lib/api/audit";
import { withApiHardening } from "@/lib/api/hardening";
import { verifyAdminAuth } from "@/lib/auth/adminAuth";
import { getDb } from "@/lib/mongodb";
import { invalidateMarketplaceCache } from "@/lib/cache/redis";

const ACTIONS = new Set(["delist", "dismiss"]);

// POST /api/admin/moderation/[reportId] — resolve a report.
// body: { action: "delist" | "dismiss", notes?: string }
// "delist" hides the material from the marketplace and resolves every pending
// report for it; "dismiss" closes only this report.
export async function POST(request, context) {
  return withApiHardening(
    request,
    { route: "admin/moderation/resolve", rateLimit: { limit: 60, windowMs: 60_000 } },
    async () => {
      const auth = await verifyAdminAuth(request);
      if (!auth.authorized) {
        auditLog({ event: "admin_unauthorized", route: "admin/moderation/resolve", method: "POST", status: auth.status || 403 });
        return NextResponse.json({ error: auth.error || "Forbidden: Admin access required" }, { status: auth.status || 403 });
      }

      const params = await Promise.resolve(context?.params);
      const reportId = params?.reportId;
      if (!reportId || !ObjectId.isValid(reportId)) {
        return NextResponse.json({ error: "Invalid report ID" }, { status: 400 });
      }

      let body = {};
      try {
        body = await request.json();
      } catch {
        body = {};
      }

      const action = body?.action;
      if (!ACTIONS.has(action)) {
        return NextResponse.json({ error: "action must be 'delist' or 'dismiss'" }, { status: 400 });
      }

      try {
        const db = await getDb();
        const report = await db.collection("reports").findOne({ _id: new ObjectId(reportId) });
        if (!report) {
          return NextResponse.json({ error: "Report not found" }, { status: 404 });
        }

        const now = new Date();
        const adminActor = auth.user.walletAddress || auth.user.address || auth.user.sub || "admin";
        const resolution = {
          resolvedAt: now,
          resolvedBy: adminActor,
          resolutionNotes: body?.notes || null,
          updatedAt: now,
        };

        if (action === "delist") {
          if (ObjectId.isValid(report.materialId)) {
            await db.collection("materials").updateOne(
              { _id: new ObjectId(report.materialId) },
              {
                $set: {
                  visibility: "delisted",
                  moderationStatus: "delisted",
                  delistedAt: now,
                  delistedBy: adminActor,
                  delistReason: report.reason,
                  updatedAt: now,
                },
              }
            );
          }

          await db.collection("reports").updateMany(
            { materialId: report.materialId, status: "pending_review" },
            { $set: { status: "actioned", moderationStatus: "delisted", ...resolution } }
          );

          await invalidateMarketplaceCache();
        } else {
          await db.collection("reports").updateOne(
            { _id: report._id },
            { $set: { status: "dismissed", moderationStatus: "dismissed", ...resolution } }
          );
        }

        await db.collection("admin_audit_trail").insertOne({
          event: action === "delist" ? "material_delisted" : "report_dismissed",
          reportId,
          materialId: report.materialId,
          title: report.materialTitle || null,
          adminActor,
          reason: report.reason,
          timestamp: now,
        });

        auditLog({
          event: action === "delist" ? "material_delisted" : "report_dismissed",
          route: "admin/moderation/resolve",
          method: "POST",
          status: 200,
          actor: adminActor,
          materialId: report.materialId,
        });

        return NextResponse.json({ success: true, reportId, materialId: report.materialId, action });
      } catch (err) {
        auditLog({ event: "admin_moderation_resolve_failed", route: "admin/moderation/resolve", method: "POST", status: 500, reason: err.message });
        return NextResponse.json({ error: "Server error" }, { status: 500 });
      }
    }
  );
}
