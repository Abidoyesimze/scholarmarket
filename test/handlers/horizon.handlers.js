import { http, HttpResponse } from 'msw';

export const horizonHandlers = [
  http.get('https://horizon-testnet.stellar.org/accounts/:account', () => HttpResponse.json({
    balances: [{ asset_type: 'credit_alphanum4', asset_code: 'USDC', asset_issuer: 'issuer', balance: '100' }],
  })),
  http.post('https://horizon-testnet.stellar.org/transactions', () => HttpResponse.json({ hash: 'mock-refund-hash' })),
  http.get('https://horizon-testnet.stellar.org/fee_stats', () => HttpResponse.json({
    fee_charged: { p10: '100', p50: '100', p95: '100' },
  })),
];
