import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  applyTaxToCheckout,
  calculateTaxAmount,
  estimateTax,
  getTaxRateForCountry,
  isValidTaxRate,
} from '../../src/lib/checkout/taxEstimator.js';

test('tax estimator table: zero, one stroop, large amount, regions, and fallback', async () => {
  const cases = [
    { name: 'zero amount', amount: 0, region: 'US', rate: 800 },
    { name: 'minimum 1 stroop rounding edge', amount: 0.0000001, region: 'US', rate: 800 },
    { name: 'very large amount', amount: 9000000000, region: 'HU', rate: 2700 },
  ];

  for (const entry of cases) {
    const result = await estimateTax({ baseAmount: entry.amount, countryCode: entry.region });
    assert.equal(result.taxRateBps, entry.rate, entry.name);
    assert.equal(result.totalAmount, result.baseAmount + result.taxAmount, entry.name);
  }

  assert.equal(getTaxRateForCountry('XX'), 0);
  assert.equal(calculateTaxAmount(100, 800), 8);
  assert.equal(calculateTaxAmount(0.0000001, 800), 0);
  assert.equal(isValidTaxRate(-1), false);
  assert.equal(isValidTaxRate(3001), false);
});

test('tax estimator rejects invalid amounts', async () => {
  await assert.rejects(() => estimateTax({ baseAmount: -1, countryCode: 'US' }));
  await assert.rejects(() => estimateTax({ baseAmount: NaN, countryCode: 'US' }));
  await assert.rejects(() => estimateTax({ baseAmount: '100', countryCode: 'US' }));
  await assert.rejects(() => applyTaxToCheckout({ amount: 0 }));
  await assert.rejects(() => applyTaxToCheckout({ amount: '100' }));
});
