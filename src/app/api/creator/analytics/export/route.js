import { NextResponse } from "next/server";
import { getDb } from "@/lib/mongodb";
import { getUserFromCookie } from "@/lib/api/auth";

export const dynamic = "force-dynamic";
import { logger } from "@/lib/logger";
export const runtime = "nodejs";

export async function GET(request) {
  try {
    const user = await getUserFromCookie(request);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const creatorAddress = user.walletAddress || user.address || user.id;
    if (!creatorAddress) {
      return NextResponse.json({ error: "No wallet address on account" }, { status: 400 });
    }

    const db = await getDb();
    const url = new URL(request.url);
    const from = url.searchParams.get("from") ? new Date(url.searchParams.get("from")) : null;
    const toParam = url.searchParams.get("to") ? new Date(url.searchParams.get("to")) : null;
    const to = toParam && !Number.isNaN(toParam.getTime()) ? toParam : null;
    const validFrom = from && !Number.isNaN(from.getTime()) ? from : null;
    if (validFrom && to && validFrom > to) {
      return NextResponse.json({ error: "Invalid date range" }, { status: 400 });
    }

    // 1. Fetch materials to get material IDs
    const materials = await db.collection("materials")
      .find({ userAddress: creatorAddress }, { projection: { materialId: 1, _id: 1 } })
      .toArray();

    const materialIdStrings = [...new Set(materials.flatMap(m => [String(m._id), String(m.materialId)].filter(Boolean)))];

    // 2. Fetch purchases for these materials
    let purchases = [];
    if (materialIdStrings.length > 0) {
      const dateFilter = validFrom || to ? { $and: [] } : null;
      if (dateFilter) {
        if (validFrom) dateFilter.$and.push({ $or: [{ purchasedAt: { $gte: validFrom } }, { createdAt: { $gte: validFrom } }] });
        if (to) dateFilter.$and.push({ $or: [{ purchasedAt: { $lte: to } }, { createdAt: { $lte: to } }] });
      }

      purchases = await db.collection("purchases")
        .find(dateFilter ? { materialId: { $in: materialIdStrings }, ...dateFilter } : { materialId: { $in: materialIdStrings } })
        .sort({ purchasedAt: -1, createdAt: -1 })
        .toArray();
    }

    // 3. Fetch payouts for this creator
    const payoutDocs = await db.collection("payouts")
      .find({ creatorAddress })
      .sort({ createdAt: -1 })
      .toArray();
    const payouts = payoutDocs.filter((p) => {
      if (!validFrom && !to) return true;
      const date = new Date(p.createdAt || p.updatedAt || 0);
      return (!validFrom || date >= validFrom) && (!to || date <= to);
    });

    // 4. Combine and format records
    const records = [];

    // Map purchases
    for (const p of purchases) {
      const date = new Date(p.purchasedAt || p.createdAt || p.updatedAt || 0).toISOString();
      records.push({
        date,
        itemId: String(p.materialId || "Unknown"),
        buyerWallet: String(p.buyerAddress || "Unknown"),
        price: p.amount || 0,
        paidAsset: p.currency || "XLM",
        status: p.status || "completed"
      });
    }

    // Map payouts
    for (const p of payouts) {
      const date = new Date(p.createdAt || p.updatedAt || 0).toISOString();
      records.push({
        date,
        itemId: "Payout",
        buyerWallet: "ScholarMarket",
        price: `-${p.amount || 0}`,
        paidAsset: p.currency || "XLM",
        status: p.status || "completed"
      });
    }

    // Sort combined records by date descending
    records.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    // 5. Generate CSV
    const headers = ["Date", "Item ID", "Buyer Wallet", "Price", "Paid Asset", "Status"];
    const csvRows = [headers.join(",")];

    const csvEscape = (value) => `"${String(value ?? "").replace(/"/g, '""')}"`;
    for (const r of records) {
      const row = [r.date, r.itemId, r.buyerWallet, r.price, r.paidAsset, r.status].map(csvEscape);
      csvRows.push(row.join(","));
    }

    const csvString = csvRows.join("\n");

    return new NextResponse(csvString, {
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": `attachment; filename="scholarmarket-analytics-${new Date().toISOString().slice(0, 10)}.csv"`,
      },
    });

  } catch (error) {
    logger.error("[analytics/export] GET error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
