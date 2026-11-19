import { NextResponse } from 'next/server';
import { verifyRefundLimit } from '@/lib/checkout/refundVerifier';
import { refundPurchaseOnChain } from '@/lib/stellar/refundService';
import { revokeEntitlement } from '@/lib/entitlement';
import logger from '@/lib/logger';
import { auditLog } from '@/lib/api/audit';
import { getDb } from '@/lib/mongodb';
import { badRequest, errorResponse } from '@/lib/utils/errorResponse';

export async function POST(req) {
  try {
    const body = await req.json();
    const { transactionId, refundAmount, purchaseId, buyerAddress, materialId, asset, destination } = body;

    if (!transactionId || !refundAmount) {
      return badRequest('Missing transactionId or refundAmount', { instance: '/api/checkout/refund', errors: [
        ...(!transactionId ? [{ field: 'transactionId', message: 'transactionId is required' }] : []),
        ...(!refundAmount ? [{ field: 'refundAmount', message: 'refundAmount is required' }] : []),
      ] });
    }

    // Verify refund limits and eligibility
    const verification = await verifyRefundLimit(transactionId, refundAmount, {
      asset,
      destination: destination || buyerAddress,
    });

    if (!verification.valid) {
      return badRequest(verification.reason, { instance: '/api/checkout/refund' });
    }

    // If purchaseId is provided, check settlement state on-chain
    if (purchaseId) {
      // The on-chain contract enforces settlement state (must be Pending)
      // We also check the local DB for a cached settlement state
      const db = await getDb();
      const purchase = await db.collection('purchases').findOne({ purchaseId: String(purchaseId) });

      if (purchase && purchase.settlementState && purchase.settlementState !== 'Pending') {
        return badRequest(
          `Purchase is in ${purchase.settlementState} state. Only Pending purchases can be refunded.`,
          { instance: '/api/checkout/refund' }
        );
      }
    }

    // Execute on-chain refund via the PurchaseManager contract
    if (purchaseId && buyerAddress) {
      try {
        const refundResult = await refundPurchaseOnChain(purchaseId, buyerAddress);
        if (!refundResult.success) {
          return errorResponse({ status: 500, detail: refundResult.error || 'On-chain refund failed', instance: '/api/checkout/refund' });
        }

        // Revoke entitlement in local cache
        if (materialId && buyerAddress) {
          await revokeEntitlement(materialId, buyerAddress);
        }

        // Update local purchase record with settlement state
        const db = await getDb();
        await db.collection('purchases').updateOne(
          { purchaseId: String(purchaseId) },
          {
            $set: {
              settlementState: 'Refunded',
              refundedAt: new Date(),
              refundTransactionHash: refundResult.hash,
              updatedAt: new Date(),
            },
          }
        );

        auditLog({
          event: 'refund_approved',
          transactionId,
          purchaseId,
          refundAmount,
          buyerAddress,
          status: 'approved',
          onChainHash: refundResult.hash,
        });

        return NextResponse.json({
          message: 'Refund processed successfully',
          data: {
            ...verification.purchase,
            settlementState: 'Refunded',
            onChainHash: refundResult.hash,
          },
        });
      } catch (chainError) {
        logger.error({ err: chainError.message }, 'On-chain refund failed');
        return errorResponse({ status: 500, detail: chainError.message, instance: '/api/checkout/refund' });
      }
    }

    // If no purchaseId, just validate (legacy path)
    auditLog({ event: 'refund_approved', transactionId, refundAmount, status: 'approved' });

    return NextResponse.json({ message: 'Refund validated successfully', data: verification.purchase });

  } catch (error) {
    logger.error({ err: error.message }, 'Failed to process refund request');
    return errorResponse({ status: 500, detail: 'Internal server error', instance: '/api/checkout/refund' });
  }
}