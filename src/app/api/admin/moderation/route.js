export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { auditLog } from "@/lib/api/audit";
import { withApiHardening } from "@/lib/api/hardening";
import { verifyAdminAuth } from "@/lib/auth/adminAuth";
import { getDb } from "@/lib/mongodb";

// GET /api/admin/moderation — pending learner reports awaiting admin review
export async function GET(request) {
  return withApiHardening(
    request,
    { route: "admin/moderation", rateLimit: { limit: 60, windowMs: 60_000 } },
    async () => {
      const auth = await verifyAdminAuth(request);
      if (!auth.authorized) {
        auditLog({ event: "admin_unauthorized", route: "admin/moderation", method: "GET", status: auth.status || 403 });
        return NextResponse.json({ error: auth.error || "Forbidden: Admin access required" }, { status: auth.status || 403 });
      }

      try {
        const db = await getDb();
        const reports = await db
          .collection("reports")
          .find({ status: "pending_review" })
          .sort({ createdAt: -1 })
          .limit(200)
          .toArray();

        return NextResponse.json({
          items: reports.map((report) => ({
            id: String(report._id),
            materialId: report.materialId,
            materialTitle: report.materialTitle || null,
            reason: report.reason,
            description: report.description || "",
            reporterAddress: report.reporterAddress || null,
            status: report.status,
            createdAt: report.createdAt,
          })),
        });
      } catch (err) {
        auditLog({ event: "admin_moderation_list_failed", route: "admin/moderation", method: "GET", status: 500, reason: err.message });
        return NextResponse.json({ error: "Server error" }, { status: 500 });
      }
    }
  );
}
