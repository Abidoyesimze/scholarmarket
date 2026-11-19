export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { issueChallenge } from "@/lib/auth/challenge";
import { normalizeWalletAddress } from "@/lib/api/validation";
import { withApiHardening } from "@/lib/api/hardening";
import { badRequest, problemResponse } from "@/lib/api/errorResponse";

export async function GET(request) {
  return withApiHardening(
    request,
    { route: "auth-challenge", rateLimit: { limit: 20, windowMs: 60_000 } },
    async () => {
      try {
        const { searchParams } = new URL(request.url);
        const address = normalizeWalletAddress(searchParams.get("address"));
        const action = searchParams.get("action") || "default";
        const origin = searchParams.get("origin");
        const network = searchParams.get("network");
        const contract = searchParams.get("contract");

        if (!address) {
          return badRequest("Missing or invalid address", [
            { field: "address", message: "Missing or invalid address" }
          ], request.url);
        }

        const challenge = await issueChallenge(address, {
          action,
          origin,
          network,
          contract,
        });
        return NextResponse.json(challenge);
      } catch (error) {
        return problemResponse({
          status: 500,
          title: "Internal Server Error",
          detail: error.message || "Server error",
          instance: request.url,
        });
      }
    }
  );
}
