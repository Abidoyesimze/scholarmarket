import { xdr, nativeToScVal, Address } from "@stellar/stellar-sdk";

// Raw Soroban RPC `getEvents` fixtures for PurchaseRefundedEvent
// (soroban/contracts/purchase-manager/src/lib.rs). Topics are
// ["purchase", "refunded", purchase_id, material_id, buyer]; data is the
// `vec` encoding of [asset, refund_amount, entitlement_revoked].

function toBase64(scVal) {
  return scVal.toXDR("base64");
}

export function symbolTopic(name) {
  return toBase64(nativeToScVal(name, { type: "symbol" }));
}

export function u64Topic(value) {
  return toBase64(nativeToScVal(BigInt(value), { type: "u64" }));
}

export function bytesTopic(buffer) {
  return toBase64(nativeToScVal(buffer, { type: "bytes" }));
}

export function addressTopic(strkey) {
  return toBase64(new Address(strkey).toScVal());
}

export function vecValue(scVals) {
  return toBase64(xdr.ScVal.scvVec(scVals));
}

export function purchaseRefundedRawEvent({
  id,
  purchaseId,
  materialId,
  buyer,
  asset,
  refundAmount,
  entitlementRevoked = true,
  ledger = 200,
}) {
  return {
    id,
    ledger,
    txHash: `refund-tx-${id}`,
    ledgerClosedAt: "2026-07-26T00:00:00Z",
    contractId: "CPURCHASEMANAGER00000000000000000000000000000000000000",
    topic: [
      symbolTopic("purchase"),
      symbolTopic("refunded"),
      u64Topic(purchaseId),
      bytesTopic(materialId),
      addressTopic(buyer),
    ],
    value: vecValue([
      new Address(asset).toScVal(),
      nativeToScVal(BigInt(refundAmount), { type: "i128" }),
      xdr.ScVal.scvBool(entitlementRevoked),
    ]),
  };
}
