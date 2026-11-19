import { NextResponse } from "next/server.js";
import { getDb } from "../../../../lib/mongodb.js";
import { validateAuth } from "../../../../lib/auth/session.js";
import { verifyAdminAuth } from "../../../../lib/auth/adminAuth.js";
import { ObjectId } from "mongodb";
import { logger } from "../../../../lib/logger.js";

export const REVIEW_AUTO_HIDE_THRESHOLD = parseInt(
  process.env.REVIEW_AUTO_HIDE_THRESHOLD || "3",
  10
);

/**
 * POST /api/reviews/report
 * Allows users to report reviews for moderation.
 * Automatically hides reviews when unique reporter count reaches REVIEW_AUTO_HIDE_THRESHOLD.
 */
export async function POST(request) {
  try {
    // Authenticate user
    const authResult = await validateAuth(request);
    if (!authResult.valid) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }

    const { address } = authResult;
    const body = await request.json();
    const { reviewId, materialId, reason, additionalDetails } = body;

    // Validate required fields
    if (!reviewId || !materialId || !reason) {
      return NextResponse.json(
        { error: "reviewId, materialId, and reason are required" },
        { status: 400 }
      );
    }

    // Validate reason
    const validReasons = ["spam", "abusive", "false", "inappropriate", "other"];
    if (!validReasons.includes(reason)) {
      return NextResponse.json(
        { error: `Invalid reason. Must be one of: ${validReasons.join(", ")}` },
        { status: 400 }
      );
    }

    const db = await getDb();

    // Verify the material exists
    const material = await db.collection("materials").findOne({
      _id: new ObjectId(materialId),
    });

    if (!material) {
      return NextResponse.json(
        { error: "Material not found" },
        { status: 404 }
      );
    }

    // Verify the review exists
    const review = await db.collection("reviews").findOne({
      _id: new ObjectId(reviewId),
      $or: [
        { materialId: new ObjectId(materialId) },
        { materialId: String(materialId) },
      ],
    });

    if (!review) {
      return NextResponse.json(
        { error: "Review not found for this material" },
        { status: 404 }
      );
    }

    // Check if this review has already been reported by this user (repeat reports from one user do not count twice)
    const existingReport = await db.collection("reported_reviews").findOne({
      reviewId: new ObjectId(reviewId),
      reportedBy: address.toLowerCase(),
    });

    if (existingReport) {
      return NextResponse.json(
        { error: "You have already reported this review" },
        { status: 409 }
      );
    }

    // Create report record
    const report = {
      reviewId: new ObjectId(reviewId),
      materialId: new ObjectId(materialId),
      materialTitle: material.title,
      reportedBy: address.toLowerCase(),
      reportedAt: new Date(),
      reason,
      additionalDetails: additionalDetails || null,
      status: "pending",
      reviewContent: {
        rating: review.rating,
        comment: review.comment,
        reviewedBy: review.reviewerAddress || review.reviewedBy || review.reviewer,
        createdAt: review.createdAt,
      },
      moderationAction: null,
      moderatedBy: null,
      moderatedAt: null,
      notes: null,
    };

    const result = await db.collection("reported_reviews").insertOne(report);

    // Count distinct unique reporters for this review
    const uniqueReporters = await db
      .collection("reported_reviews")
      .distinct("reportedBy", { reviewId: new ObjectId(reviewId) });
    const distinctCount = uniqueReporters.length;

    const threshold = parseInt(process.env.REVIEW_AUTO_HIDE_THRESHOLD || "3", 10);
    let autoHidden = false;

    if (distinctCount >= threshold) {
      autoHidden = true;

      // 1. Mark review as hidden_pending_review
      await db.collection("reviews").updateOne(
        { _id: new ObjectId(reviewId) },
        {
          $set: {
            status: "hidden_pending_review",
            autoHidden: true,
            hiddenAt: new Date(),
            flagCount: distinctCount,
            lastFlaggedAt: new Date(),
          },
        }
      );

      // 2. Add hidden review to the moderation queue
      await db.collection("moderation_queue").updateOne(
        { reviewId: new ObjectId(reviewId) },
        {
          $set: {
            reviewId: new ObjectId(reviewId),
            materialId: new ObjectId(materialId),
            materialTitle: material.title,
            type: "review",
            status: "pending_review",
            reporterCount: distinctCount,
            autoHidden: true,
            updatedAt: new Date(),
          },
          $setOnInsert: {
            createdAt: new Date(),
          },
        },
        { upsert: true }
      );

      // 3. Notify the review author
      const reviewAuthor =
        review.reviewerAddress || review.reviewedBy || review.reviewer || review.userAddress;
      if (reviewAuthor) {
        await db.collection("notifications").insertOne({
          userId: reviewAuthor.toLowerCase(),
          recipient: reviewAuthor.toLowerCase(),
          type: "review_hidden",
          title: "Your review has been temporarily hidden",
          message: `Your review on "${material.title}" received multiple community reports and has been hidden pending moderation review.`,
          metadata: {
            reviewId: reviewId.toString(),
            materialId: materialId.toString(),
            distinctReporters: distinctCount,
          },
          read: false,
          createdAt: new Date(),
        });
      }
    } else {
      // Normal report update
      await db.collection("reviews").updateOne(
        { _id: new ObjectId(reviewId) },
        {
          $set: {
            flagCount: distinctCount,
            lastFlaggedAt: new Date(),
          },
        }
      );
    }

    return NextResponse.json(
      {
        success: true,
        reportId: result.insertedId.toString(),
        distinctReporters: distinctCount,
        autoHidden,
        message: autoHidden
          ? "Review reported and automatically hidden pending moderation review"
          : "Review reported successfully and queued for moderation",
      },
      { status: 201 }
    );
  } catch (error) {
    logger.error("Error reporting review:", error);
    return NextResponse.json(
      { error: "Failed to report review", details: error.message },
      { status: 500 }
    );
  }
}

/**
 * GET /api/reviews/report
 * Get reported reviews.
 * Admins can see all reports; normal users see only their submitted reports.
 */
export async function GET(request) {
  try {
    const authResult = await validateAuth(request);
    if (!authResult.valid) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }

    const { address } = authResult;
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status") || "pending";

    const db = await getDb();

    // Check if the user has admin privileges
    const adminCheck = await verifyAdminAuth(request);
    const userIsAdmin = adminCheck.authorized;

    const query = {
      ...(!userIsAdmin && { reportedBy: address.toLowerCase() }),
      ...(status !== "all" && { status }),
    };

    const reports = await db
      .collection("reported_reviews")
      .find(query)
      .sort({ reportedAt: -1 })
      .limit(100)
      .toArray();

    return NextResponse.json({
      success: true,
      reports: reports.map((r) => ({
        ...r,
        _id: r._id.toString(),
        reviewId: r.reviewId.toString(),
        materialId: r.materialId.toString(),
      })),
    });
  } catch (error) {
    logger.error("Error fetching reported reviews:", error);
    return NextResponse.json(
      { error: "Failed to fetch reported reviews", details: error.message },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/reviews/report
 * Allows admins to restore or permanently remove reported reviews.
 */
export async function PATCH(request) {
  try {
    const adminAuth = await verifyAdminAuth(request);
    if (!adminAuth.authorized) {
      return NextResponse.json(
        { error: adminAuth.error || "Admin access required" },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { reviewId, action, notes } = body;

    if (!reviewId || !["restore", "remove"].includes(action)) {
      return NextResponse.json(
        { error: "reviewId and valid action ('restore' or 'remove') are required" },
        { status: 400 }
      );
    }

    const db = await getDb();
    const reviewObjectId = new ObjectId(reviewId);

    const review = await db.collection("reviews").findOne({ _id: reviewObjectId });
    if (!review) {
      return NextResponse.json({ error: "Review not found" }, { status: 404 });
    }

    const adminId =
      adminAuth.user?.sub || adminAuth.user?.walletAddress || "admin";

    if (action === "restore") {
      await db.collection("reviews").updateOne(
        { _id: reviewObjectId },
        {
          $set: {
            status: "active",
            autoHidden: false,
            restoredAt: new Date(),
            restoredBy: adminId,
          },
          $unset: { hiddenReason: "", hiddenAt: "" },
        }
      );

      await db.collection("reported_reviews").updateMany(
        { reviewId: reviewObjectId },
        {
          $set: {
            status: "resolved",
            moderationAction: "restored",
            moderatedBy: adminId,
            moderatedAt: new Date(),
            notes: notes || null,
          },
        }
      );

      await db.collection("moderation_queue").updateOne(
        { reviewId: reviewObjectId },
        {
          $set: {
            status: "resolved",
            moderationAction: "restored",
            resolvedAt: new Date(),
            resolvedBy: adminId,
          },
        }
      );

      return NextResponse.json({
        success: true,
        message: "Review restored successfully",
        reviewId,
        action: "restore",
      });
    } else if (action === "remove") {
      await db.collection("reviews").updateOne(
        { _id: reviewObjectId },
        {
          $set: {
            status: "permanently_removed",
            autoHidden: false,
            removedAt: new Date(),
            removedBy: adminId,
          },
        }
      );

      await db.collection("reported_reviews").updateMany(
        { reviewId: reviewObjectId },
        {
          $set: {
            status: "resolved",
            moderationAction: "permanently_removed",
            moderatedBy: adminId,
            moderatedAt: new Date(),
            notes: notes || null,
          },
        }
      );

      await db.collection("moderation_queue").updateOne(
        { reviewId: reviewObjectId },
        {
          $set: {
            status: "resolved",
            moderationAction: "permanently_removed",
            resolvedAt: new Date(),
            resolvedBy: adminId,
          },
        }
      );

      // Recalculate material average rating without this review
      if (review.materialId) {
        const matId = review.materialId;
        const aggregation = await db
          .collection("reviews")
          .aggregate([
            {
              $match: {
                $or: [
                  { materialId: new ObjectId(matId) },
                  { materialId: String(matId) },
                ],
                status: { $nin: ["hidden_pending_review", "permanently_removed"] },
              },
            },
            {
              $group: {
                _id: null,
                averageRating: { $avg: "$rating" },
                reviewCount: { $sum: 1 },
              },
            },
          ])
          .toArray();

        const stats = aggregation[0] ?? { averageRating: 0, reviewCount: 0 };
        const averageRating = Math.round((stats.averageRating || 0) * 100) / 100;
        const reviewCount = stats.reviewCount || 0;

        await db.collection("materials").updateOne(
          {
            $or: [
              { _id: new ObjectId(matId) },
              ...(ObjectId.isValid(matId) ? [{ _id: new ObjectId(matId) }] : []),
            ],
          },
          {
            $set: {
              rating: averageRating,
              averageRating,
              reviewCount,
              reviewsCount: reviewCount,
              updatedAt: new Date(),
            },
          }
        );
      }

      return NextResponse.json({
        success: true,
        message: "Review permanently removed",
        reviewId,
        action: "remove",
      });
    }
  } catch (error) {
    logger.error("Error moderating review:", error);
    return NextResponse.json(
      { error: "Failed to moderate review", details: error.message },
      { status: 500 }
    );
  }
}
