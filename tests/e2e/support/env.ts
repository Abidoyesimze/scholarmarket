/**
 * Shared E2E settings. The dev server started by playwright.config.ts is
 * given the same JWT secret so sessions minted by the specs pass the
 * dashboard auth gate in src/proxy.js, and NEXT_PUBLIC_E2E_WALLET_MOCK
 * enables the injected wallet in src/providers/WalletProvider.jsx.
 */
export const E2E_JWT_SECRET =
  process.env.E2E_JWT_SECRET || 'scholarmarket-e2e-only-secret-0123456789abcdef';

export const E2E_BASE_URL = process.env.E2E_BASE_URL || 'http://localhost:3000';
