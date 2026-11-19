import assert from 'node:assert/strict';
import { test } from 'node:test';

import { verifyRefundRequest } from '../../src/lib/checkout/refundVerifier.js';
import { getNetworkPassphrase } from '../../src/lib/stellar/refundService.js';
import { Networks } from '@stellar/stellar-sdk';

test('refund eligibility accepts matching purchase and rejects mismatch', () => {
  const purchase = {
    amount: '100',
    asset: 'USDC',
    destinationAddress: 'GBUYER',
  };

  assert.equal(verifyRefundRequest(purchase, '25', { asset: 'USDC', destination: 'GBUYER' }).valid, true);
  assert.equal(verifyRefundRequest(purchase, '101').reason, 'Refund amount exceeds original purchase value');
  assert.equal(verifyRefundRequest(purchase, '25', { asset: 'XLM' }).reason, 'Refund asset does not match original purchase');
  assert.equal(verifyRefundRequest(purchase, '25', { destination: 'GOTHER' }).reason, 'Refund destination does not match original purchase');
  assert.equal(verifyRefundRequest(purchase, 'NaN').reason, 'Invalid amount formats');
  assert.equal(verifyRefundRequest(purchase, '-1').reason, 'Invalid refund amount');
  assert.equal(verifyRefundRequest(null, '1').reason, 'Transaction not found');
});

test('refund network passphrase selects testnet and public networks', () => {
  assert.equal(getNetworkPassphrase('TESTNET'), Networks.TESTNET);
  assert.equal(getNetworkPassphrase('PUBLIC'), Networks.PUBLIC);
  assert.equal(getNetworkPassphrase('mainnet'), Networks.PUBLIC);
});
