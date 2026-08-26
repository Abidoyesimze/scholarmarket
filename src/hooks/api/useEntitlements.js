import { useQuery } from '@tanstack/react-query';
import { purchaseService } from '@/services/purchaseService';
import { queryKeys } from '@/lib/query/queryKeys';
import { useAccount } from 'wagmi';

/**
 * Hook to check if the current user has entitlement to a specific material.
 * Supports both authenticated checks and eventual on-chain sync.
 */
export function useEntitlement(materialId) {
  const { address } = useAccount();

  return useQuery({
    queryKey: queryKeys.purchases.entitlement(materialId, address),
    queryFn: () => purchaseService.checkEntitlement(materialId, address),
    enabled: !!materialId && !!address,
    staleTime: 30 * 60 * 1000, // Entitlements don't change often
    retry: 1,
  });
}

/**
 * Hook to check multiple material entitlements at once (useful for marketplace listings).
 *
 * Sends a single POST /api/entitlements/batch request for all IDs and returns
 * a Map<materialId, boolean> for O(1) per-item lookups in render.
 * Limited to 50 IDs per call — split larger sets into chunks before passing.
 */
export function useBatchEntitlements(materialIds = []) {
  const { address } = useAccount();

  return useQuery({
    queryKey: ['purchases', 'entitlements', 'batch', materialIds, address],
    queryFn: async () => {
      const data = await purchaseService.checkBatchEntitlements(materialIds, address);
      // Build a Map for O(1) per-item access in rendering components
      const map = new Map();
      if (Array.isArray(data?.results)) {
        for (const item of data.results) {
          map.set(item.materialId, item.hasAccess);
        }
      }
      return map;
    },
    enabled: materialIds.length > 0 && !!address,
    staleTime: 30 * 60 * 1000,
  });
}
