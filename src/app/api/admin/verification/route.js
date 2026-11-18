export const dynamic = "force-dynamic";
import { logger } from "@/lib/logger";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { getDb } from "@/lib/mongodb";
import { auditLog } from "@/lib/api/audit";
import { verifyAdminAuth } from "@/lib/auth/adminAuth";

export async function POST(request) {
  try {
    const auth = await verifyAdminAuth(request);
    if (!auth.authorized) {
      return NextResponse.json(
        { error: auth.error },
        { status: auth.status }
      );
    }
    const admin = auth.user;

    const body = await request.json();
    const { applicationId, action } = body;

    if (!applicationId || !["approve", "reject"].includes(action)) {
      return NextResponse.json(
        { error: "applicationId and valid action (approve/reject) are required" },
        { status: 400 }
      );
    }

    const db = await getDb();
    const applications = db.collection("verification_applications");
    const profiles = db.collection("profiles");

    const application = await applications.findOne({ _id: applicationId });
    if (!application) {
      return NextResponse.json(
        { error: "Application not found" },
        { status: 404 }
      );
    }

    if (application.status !== "pending") {
      return NextResponse.json(
        { error: `Application is already ${application.status}` },
        { status: 400 }
      );
    }

    const newStatus = action === "approve" ? "approved" : "rejected";
    const updateFields = {
      status: newStatus,
      reviewedBy: admin.sub || admin._id,
      reviewedAt: new Date(),
      updatedAt: new Date(),
    };

    await applications.updateOne(
      { _id: applicationId },
      { $set: updateFields }
    );

    if (action === "approve") {
      await profiles.updateOne(
        { uuid: application.userUuid },
        {
          $set: {
            profileType: application.requestedType || "institution",
            verifiedAt: new Date(),
            updatedAt: new Date(),
          },
        }
      );
    }

    auditLog({
      event: `admin_verification_${action}`,
      route: "admin/verification",
      method: "POST",
      status: 200,
      actor: admin.sub || admin._id,
      materialId: applicationId,
    });

    return NextResponse.json({ success: true, status: newStatus });
  } catch (error) {
    logger.error("[admin/verification] POST error:", error);
    return NextResponse.json(
      { error: error.message || "Internal Server Error" },
      { status: 500 }
    );
  }
}

export async function GET(request) {
  try {
    const auth = await verifyAdminAuth(request);
    if (!auth.authorized) {
      return NextResponse.json(
        { error: auth.error },
        { status: auth.status }
      );
    }
    const admin = auth.user;

    const db = await getDb();
    const applications = await db
      .collection("verification_applications")
      .find({ status: "pending" })
      .sort({ createdAt: -1 })
      .limit(50)
      .toArray();

    return NextResponse.json({ applications });
  } catch (error) {
    logger.error("[admin/verification] GET error:", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  }
}
