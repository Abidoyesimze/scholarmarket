import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Networks } from '@stellar/stellar-sdk';

describe('Network Configuration (chain.js)', () => {
  let originalEnv;

  beforeEach(() => {
    originalEnv = process.env;
    // Reset module cache to reload chain.js with new env vars
    delete require.cache[require.resolve('../chain.js')];
  });

  afterEach(() => {
    process.env = originalEnv;
    // Clean up module cache
    delete require.cache[require.resolve('../chain.js')];
  });

  describe('NETWORK_PASSPHRASE', () => {
    it('should use TESTNET passphrase by default', async () => {
      vi.stubEnv('NEXT_PUBLIC_STELLAR_NETWORK', 'TESTNET');
      const { NETWORK_PASSPHRASE } = await import('../chain.js');
      expect(NETWORK_PASSPHRASE).toBe(Networks.TESTNET);
    });

    it('should use PUBLIC passphrase when explicitly set', async () => {
      vi.stubEnv('NEXT_PUBLIC_STELLAR_NETWORK', 'PUBLIC');
      const { NETWORK_PASSPHRASE } = await import('../chain.js');
      expect(NETWORK_PASSPHRASE).toBe(Networks.PUBLIC);
    });

    it('should default to TESTNET when STELLAR_NETWORK is not set', async () => {
      vi.stubEnv('NEXT_PUBLIC_STELLAR_NETWORK', undefined);
      const { NETWORK_PASSPHRASE } = await import('../chain.js');
      expect(NETWORK_PASSPHRASE).toBe(Networks.TESTNET);
    });

    it('should use TESTNET for invalid network values', async () => {
      vi.stubEnv('NEXT_PUBLIC_STELLAR_NETWORK', 'INVALID_NETWORK');
      const { NETWORK_PASSPHRASE } = await import('../chain.js');
      expect(NETWORK_PASSPHRASE).toBe(Networks.TESTNET);
    });
  });

  describe('Explorer URLs', () => {
    it('should generate correct explorer URL for PUBLIC network', async () => {
      vi.stubEnv('NEXT_PUBLIC_STELLAR_NETWORK', 'PUBLIC');
      vi.stubEnv('NEXT_PUBLIC_EXPLORER_URL', undefined);
      const { EXPLORER_URL, getExplorerTxUrl, getExplorerAccountUrl } = await import('../chain.js');

      expect(EXPLORER_URL).toBe('https://stellar.expert/explorer/public');
      expect(getExplorerTxUrl('abc123')).toBe('https://stellar.expert/explorer/public/tx/abc123');
      expect(getExplorerAccountUrl('GBUQWP3BOUZX34ULNQG23RQ6F4V4UYYSRX5MOELL2CKWTG7LSOF2XP2')).toBe(
        'https://stellar.expert/explorer/public/account/GBUQWP3BOUZX34ULNQG23RQ6F4V4UYYSRX5MOELL2CKWTG7LSOF2XP2'
      );
    });

    it('should generate correct explorer URL for TESTNET network', async () => {
      vi.stubEnv('NEXT_PUBLIC_STELLAR_NETWORK', 'TESTNET');
      vi.stubEnv('NEXT_PUBLIC_EXPLORER_URL', undefined);
      const { EXPLORER_URL, getExplorerTxUrl, getExplorerAccountUrl } = await import('../chain.js');

      expect(EXPLORER_URL).toBe('https://stellar.expert/explorer/testnet');
      expect(getExplorerTxUrl('xyz789')).toBe('https://stellar.expert/explorer/testnet/tx/xyz789');
      expect(getExplorerAccountUrl('GBUQWP3BOUZX34ULNQG23RQ6F4V4UYYSRX5MOELL2CKWTG7LSOF2XP2')).toBe(
        'https://stellar.expert/explorer/testnet/account/GBUQWP3BOUZX34ULNQG23RQ6F4V4UYYSRX5MOELL2CKWTG7LSOF2XP2'
      );
    });

    it('should use custom explorer URL when provided', async () => {
      vi.stubEnv('NEXT_PUBLIC_EXPLORER_URL', 'https://custom.explorer');
      const { EXPLORER_URL, getExplorerTxUrl } = await import('../chain.js');

      expect(EXPLORER_URL).toBe('https://custom.explorer');
      expect(getExplorerTxUrl('hash')).toBe('https://custom.explorer/tx/hash');
    });
  });

  describe('RPC and Horizon URLs', () => {
    it('should use custom STELLAR_RPC_URL when provided', async () => {
      vi.stubEnv('STELLAR_RPC_URL', 'https://custom-rpc.stellar.org');
      vi.stubEnv('NEXT_PUBLIC_STELLAR_RPC_URL', undefined);
      const { STELLAR_RPC_URL } = await import('../chain.js');
      expect(STELLAR_RPC_URL).toBe('https://custom-rpc.stellar.org');
    });

    it('should use NEXT_PUBLIC_STELLAR_RPC_URL over STELLAR_RPC_URL', async () => {
      vi.stubEnv('NEXT_PUBLIC_STELLAR_RPC_URL', 'https://public-rpc.stellar.org');
      vi.stubEnv('STELLAR_RPC_URL', 'https://private-rpc.stellar.org');
      const { STELLAR_RPC_URL } = await import('../chain.js');
      expect(STELLAR_RPC_URL).toBe('https://public-rpc.stellar.org');
    });

    it('should default to testnet RPC when no custom RPC is provided', async () => {
      vi.stubEnv('STELLAR_RPC_URL', undefined);
      vi.stubEnv('NEXT_PUBLIC_STELLAR_RPC_URL', undefined);
      const { STELLAR_RPC_URL } = await import('../chain.js');
      expect(STELLAR_RPC_URL).toBe('https://soroban-testnet.stellar.org');
    });

    it('should use PUBLIC Horizon URL when network is PUBLIC', async () => {
      vi.stubEnv('NEXT_PUBLIC_STELLAR_NETWORK', 'PUBLIC');
      vi.stubEnv('NEXT_PUBLIC_HORIZON_URL', undefined);
      const { HORIZON_URL } = await import('../chain.js');
      expect(HORIZON_URL).toBe('https://horizon.stellar.org');
    });

    it('should use TESTNET Horizon URL by default', async () => {
      vi.stubEnv('NEXT_PUBLIC_STELLAR_NETWORK', 'TESTNET');
      vi.stubEnv('NEXT_PUBLIC_HORIZON_URL', undefined);
      const { HORIZON_URL } = await import('../chain.js');
      expect(HORIZON_URL).toBe('https://horizon-testnet.stellar.org');
    });
  });

  describe('Contract IDs', () => {
    it('should allow empty contract IDs to be set', async () => {
      vi.stubEnv('NEXT_PUBLIC_MATERIAL_REGISTRY_CONTRACT_ID', '');
      vi.stubEnv('NEXT_PUBLIC_PURCHASE_MANAGER_CONTRACT_ID', '');
      const { MATERIAL_REGISTRY_CONTRACT_ID, PURCHASE_MANAGER_CONTRACT_ID } = await import('../chain.js');

      expect(MATERIAL_REGISTRY_CONTRACT_ID).toBe('');
      expect(PURCHASE_MANAGER_CONTRACT_ID).toBe('');
    });

    it('should use contract IDs from environment variables', async () => {
      vi.stubEnv('NEXT_PUBLIC_MATERIAL_REGISTRY_CONTRACT_ID', 'CABC123');
      vi.stubEnv('NEXT_PUBLIC_PURCHASE_MANAGER_CONTRACT_ID', 'CXYZ789');
      const { MATERIAL_REGISTRY_CONTRACT_ID, PURCHASE_MANAGER_CONTRACT_ID } = await import('../chain.js');

      expect(MATERIAL_REGISTRY_CONTRACT_ID).toBe('CABC123');
      expect(PURCHASE_MANAGER_CONTRACT_ID).toBe('CXYZ789');
    });
  });

  describe('getNetworkName', () => {
    it('should return "Mainnet" for PUBLIC passphrase', async () => {
      const { getNetworkName } = await import('../chain.js');
      expect(getNetworkName(Networks.PUBLIC)).toBe('Mainnet');
    });

    it('should return "Testnet" for TESTNET passphrase', async () => {
      const { getNetworkName } = await import('../chain.js');
      expect(getNetworkName(Networks.TESTNET)).toBe('Testnet');
    });

    it('should return "Unknown" for unrecognized passphrase', async () => {
      const { getNetworkName } = await import('../chain.js');
      expect(getNetworkName('unknown-passphrase')).toBe('Unknown');
    });
  });

  describe('IPFS Gateway', () => {
    it('should use custom IPFS gateway when provided', async () => {
      vi.stubEnv('NEXT_PUBLIC_GATEWAY_URL', 'https://custom-gateway.ipfs.io');
      const { IPFS_GATEWAY_URL } = await import('../chain.js');
      expect(IPFS_GATEWAY_URL).toBe('https://custom-gateway.ipfs.io');
    });

    it('should default to pinata gateway', async () => {
      vi.stubEnv('NEXT_PUBLIC_GATEWAY_URL', undefined);
      const { IPFS_GATEWAY_URL } = await import('../chain.js');
      expect(IPFS_GATEWAY_URL).toBe('https://gateway.pinata.cloud');
    });
  });
});
