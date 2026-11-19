export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { TransactionBuilder, Operation, Asset, Networks } from "@stellar/stellar-sdk";
import { getUserFromCookie } from "@/lib/api/auth";
import { loadAccount, checkBuyerTrustline } from "@/lib/stellar/horizonClient";
import { calculateDynamicFee } from "@/lib/stellar/checkoutService";
import { NETWORK_PASSPHRASE, ACCEPTED_ASSET, isMainnet } from "@/lib/config/chain";
import logger from "@/lib/logger";

const PLATFORM_ADDRESS = process.env.STELLAR_PLATFORM_ADDRESS || process.env.STELLAR_ADMIN_PUBLIC_KEY;

const KNOWN_ISSUERS = {
  testnet: "GBBD47IF6LWK7P7MDEVSCWRZDPOVPOFWLYERWFBN4JSE3OUQTISLV5EX",
  mainnet: "GA5ZSEJYB37JDD5G3LYVYF77RD7QFGHSXPJNKXJFUMIVYQ33HE6IGM4Y",
};

/**
 * POST /api/checkout/build-xdr
 *
 * Builds an unsigned Stellar transaction XDR for a checkout payment.
 * The client signs the returned XDR via the wallet and submits it via
 * useStellarTransaction.
 *
 * @returns {{ unsignedXdr: string, networkPassphrase: string, explorerBaseUrl: string }}
 */
export async function POST(req) {
  try {
    const user = await getUserFromCookie(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { buyerAddress, amount, asset } = body;

    if (!buyerAddress) {
      return NextResponse.json({ error: "Missing buyerAddress" }, { status: 400 });
    }

    if (!amount || Number.parseFloat(amount) <= 0) {
      return NextResponse.json({ error: "Invalid amount" }, { status: 400 });
    }

    if (!PLATFORM_ADDRESS) {
      logger.error("STELLAR_PLATFORM_ADDRESS or STELLAR_ADMIN_PUBLIC_KEY is not configured");
      return NextResponse.json(
        { error: "Payment destination not configured" },
        { status: 500 },
      );
    }

    const assetCode = asset || ACCEPTED_ASSET;
    const issuerAddress = process.env.NEXT_PUBLIC_USDC_ISSUER || KNOWN_ISSUERS[isMainnet ? "mainnet" : "testnet"];

    const trustline = await checkBuyerTrustline(buyerAddress, assetCode, issuerAddress);
    if (!trustline.hasTrustline) {
      return NextResponse.json(
        {
          error: "Missing trustline",
          detail: `You need to establish a trustline for ${assetCode} before paying.`,
          code: "missing_trustline",
        },
        { status: 400 },
      );
    }

    const account = await loadAccount(buyerAddress);
    const { feeStroops } = await calculateDynamicFee();

    const stellarAsset =
      assetCode === "XLM"
        ? Asset.native()
        : new Asset(assetCode, issuerAddress);

    const amountStr = Number.parseFloat(amount).toFixed(7);

    const tx = new TransactionBuilder(account, {
      fee: String(feeStroops),
      networkPassphrase: NETWORK_PASSPHRASE,
    })
      .addOperation(
        Operation.payment({
          destination: PLATFORM_ADDRESS,
          asset: stellarAsset,
          amount: amountStr,
        }),
      )
      .setTimeout(300)
      .build();

    const unsignedXdr = tx.toXDR();

    const explorerBaseUrl = isMainnet
      ? "https://stellar.expert/explorer/public/tx"
      : "https://stellar.expert/explorer/testnet/tx";

    return NextResponse.json({
      unsignedXdr,
      networkPassphrase: NETWORK_PASSPHRASE,
      explorerBaseUrl,
    });
  } catch (err) {
    logger.error({ err: err.message }, "POST /api/checkout/build-xdr failed");

    if (err.message?.includes("Account not found")) {
      return NextResponse.json(
        {
          error: "Account not found",
          detail: "Your Stellar account has not been funded yet. Send some XLM to your address first.",
          code: "account_not_found",
        },
        { status: 400 },
      );
    }

    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
