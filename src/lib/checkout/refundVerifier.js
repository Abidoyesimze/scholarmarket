import { getDb } from "../mongodb.js";
import logger from '../logger.js';
import { auditLog } from '../api/audit.js';

export function verifyRefundRequest(purchase, refundAmount, expected = {}) {
  if (!purchase) return { valid: false, reason: 'Transaction not found' };

  const paidAmount = Number(purchase.amount);
  const claimAmount = Number(refundAmount);
  if (!Number.isFinite(paidAmount) || !Number.isFinite(claimAmount)) {
    return { valid: false, reason: 'Invalid amount formats' };
  }
  if (claimAmount < 0 || claimAmount > paidAmount) {
    return { valid: false, reason: claimAmount < 0 ? 'Invalid refund amount' : 'Refund amount exceeds original purchase value' };
  }

  const expectedAsset = expected.asset || expected.assetCode;
  const purchaseAsset = purchase.asset || purchase.assetCode;
  if (expectedAsset && purchaseAsset && String(expectedAsset).toUpperCase() !== String(purchaseAsset).toUpperCase()) {
    return { valid: false, reason: 'Refund asset does not match original purchase' };
  }

  const expectedDestination = expected.destination || expected.destinationAddress || expected.buyerAddress;
  const purchaseDestination = purchase.destination || purchase.destinationAddress || purchase.buyerAddress;
  if (expectedDestination && purchaseDestination && String(expectedDestination) !== String(purchaseDestination)) {
    return { valid: false, reason: 'Refund destination does not match original purchase' };
  }

  return { valid: true, purchase };
}

export async function verifyRefundLimit(transactionId, refundAmount, expected = {}) {
  const db = await getDb();
  const purchases = db.collection('purchases');

  const purchase = await purchases.findOne({ transactionHash: transactionId });

  if (!purchase) {
    logger.warn({ transactionId, refundAmount }, 'Refund requested for unknown transaction');
    auditLog({ event: 'refund_rejected_not_found', reason: 'Transaction not found', transactionId, refundAmount, status: 'rejected' });
    return {
      valid: false,
      reason: 'Transaction not found'
    };
  }

  const verification = verifyRefundRequest(purchase, refundAmount, expected);
  if (!verification.valid) {
    const paidAmount = Number(purchase.amount);
    const claimAmount = Number(refundAmount);
    logger.warn({ transactionId, paidAmount, claimAmount, reason: verification.reason }, 'Refund rejected');
    auditLog({ event: 'refund_rejected', reason: verification.reason, transactionId, paidAmount, claimAmount, status: 'rejected' });
  }
  return verification;
}
