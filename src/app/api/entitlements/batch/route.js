export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { verifyEntitlement } from "@/lib/entitlement";
import { validateAuth } from "@/lib/auth/session";

/** Maximum number of material IDs accepted per request — mirrors the
 *  on-chain `MAX_BATCH_ENTITLEMENTS` cap so callers never need a different
 *  limit for the DB-cache path vs a direct contract call. */
const MAX_BATCH_SIZE = 50;

/**
 * POST /api/entitlements/batch
 *
 * Body: { materialIds: string[], buyerAddress?: string }
 *
 * Returns: { results: { materialId: string, hasAccess: boolean, source: string }[] }
 *
 * `buyerAddress` is optional — when omitted the server reads it from the
 * authenticated session cookie.  All lookups run in parallel via
 * Promise.allSettled so a single slow chain call cannot block the others.
 */
export async function POST(req) {
  try {
    const body = await req.json().catch(() => null);

    if (!body || !Array.isArray(body.materialIds)) {
      return NextResponse.json(
        { error: "Request body must include a materialIds array" },
        { status: 400 }
      );
    }

    const { materialIds, buyerAddress: bodyAddress } = body;

    // Resolve buyer address — prefer explicit body param, fall back to session
    let buyerAddress = bodyAddress ?? null;
    if (!buyerAddress) {
      const auth = await validateAuth(req).catch(() => ({ valid: false }));
      buyerAddress = auth.valid ? (auth.address ?? null) : null;
    }

    if (!buyerAddress) {
      return NextResponse.json(
        { error: "buyerAddress is required (pass in body or authenticate first)" },
        { status: 400 }
      );
    }

    if (materialIds.length === 0) {
      return NextResponse.json({ results: [] }, { status: 200 });
    }

    // Enforce the same cap as the on-chain function
    if (materialIds.length > MAX_BATCH_SIZE) {
      return NextResponse.json(
        { error: `Too many material IDs — limit is ${MAX_BATCH_SIZE} per request` },
        { status: 400 }
      );
    }

    // Run all entitlement checks in parallel
    const settled = await Promise.allSettled(
      materialIds.map((materialId) => verifyEntitlement(materialId, buyerAddress))
    );

    const results = settled.map((outcome, index) => {
      if (outcome.status === "fulfilled") {
        return {
          materialId: materialIds[index],
          hasAccess: outcome.value.hasAccess,
          source: outcome.value.source,
        };
      }
      // Individual lookup failure — treat as no access rather than a 500
      return {
        materialId: materialIds[index],
        hasAccess: false,
        source: "error",
      };
    });

    return NextResponse.json({ results }, { status: 200 });
  } catch (error) {
    console.error("Batch entitlement check error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
