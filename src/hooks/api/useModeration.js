import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { adminService } from '@/services/adminService';
import { queryKeys } from '@/lib/query/queryKeys';

/**
 * Fetches the pending moderation queue (admin only).
 *
 * A 401/403 is not retried so non-admins see the access-denied state
 * immediately instead of after several backoff attempts.
 *
 * @returns {object} A react-query result whose data is `{ items: Report[] }`.
 */
export function useModerationQueue() {
  return useQuery({
    queryKey: queryKeys.admin.moderation(),
    queryFn: () => adminService.getModerationQueue(),
    retry: (failureCount, error) =>
      error?.status !== 401 && error?.status !== 403 && failureCount < 2,
  });
}

/**
 * Mutation hook that resolves a report by delisting its material or dismissing it.
 *
 * Invalidates the moderation queue and marketplace listings on success so a
 * delisted material disappears everywhere without a reload.
 *
 * @returns {object} A react-query mutation object. Call `mutate({ reportId, action })`.
 */
export function useResolveReport() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: adminService.resolveReport,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.admin.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.materials.all });
    },
  });
}
