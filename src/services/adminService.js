import { apiClient } from '@/lib/api/apiClient';

export const adminService = {
  getModerationQueue: async () => {
    return apiClient('/api/admin/moderation');
  },

  resolveReport: async ({ reportId, action, notes }) => {
    return apiClient(`/api/admin/moderation/${reportId}`, { body: { action, notes } });
  },
};
