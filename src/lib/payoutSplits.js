import { StrKey } from "@stellar/stellar-sdk";

export const MAX_PAYOUT_SPLITS = 10;
export const TOTAL_BPS = 10000;

export function validatePayoutSplits(splits = []) {
  const errors = {};
  const recipients = new Set();
  let totalBps = 0;

  if (!Array.isArray(splits) || splits.length === 0) {
    return { valid: false, totalBps: 0, errors: { total: "Add at least one payout recipient" } };
  }
  if (splits.length > MAX_PAYOUT_SPLITS) errors.total = `A maximum of ${MAX_PAYOUT_SPLITS} recipients is allowed`;

  splits.forEach((split, index) => {
    const address = String(split.address || "").trim();
    const bps = Math.round(Number(split.percentage) * 100);
    if (!address || !StrKey.isValidEd25519PublicKey(address)) errors[`address_${index}`] = "Enter a valid Stellar address";
    if (recipients.has(address)) errors[`address_${index}`] = "Recipient addresses must be unique";
    if (address) recipients.add(address);
    if (!Number.isInteger(bps) || bps <= 0) errors[`percentage_${index}`] = "Share must be greater than 0 bps";
    totalBps += Number.isFinite(bps) ? bps : 0;
  });
  if (totalBps !== TOTAL_BPS) errors.total = `Shares must total 10,000 bps (currently ${totalBps.toLocaleString()} bps)`;
  return { valid: Object.keys(errors).length === 0, totalBps, errors };
}
