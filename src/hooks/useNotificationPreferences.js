"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

export const notificationPreferencesKey = ["notification-preferences"];

async function readJson(response) {
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || `Request failed (${response.status})`);
  return body;
}

export function useNotificationPreferences() {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: notificationPreferencesKey,
    queryFn: async () => readJson(await fetch("/api/notifications/preferences", { cache: "no-store" })),
  });

  const mutation = useMutation({
    mutationFn: async (preferences) => readJson(await fetch("/api/notifications/preferences", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(preferences),
    })),
    onMutate: async (preferences) => {
      await queryClient.cancelQueries({ queryKey: notificationPreferencesKey });
      const previous = queryClient.getQueryData(notificationPreferencesKey);
      queryClient.setQueryData(notificationPreferencesKey, (current) => ({
        preferences: { ...(current?.preferences || {}), ...preferences, receipts: true },
        updatedAt: current?.updatedAt || null,
      }));
      return { previous };
    },
    onError: (_error, _preferences, context) => {
      if (context?.previous) queryClient.setQueryData(notificationPreferencesKey, context.previous);
    },
    onSuccess: (data) => queryClient.setQueryData(notificationPreferencesKey, data),
  });

  return { ...query, updatePreferences: mutation.mutateAsync, isSaving: mutation.isPending, saveError: mutation.error };
}
