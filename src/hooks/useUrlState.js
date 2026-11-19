'use client';

import { useCallback } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';

export function useUrlState() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const replaceState = useCallback((path, values) => {
    const params = new URLSearchParams();
    Object.entries(values).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') params.set(key, String(value));
    });
    const query = params.toString();
    router.replace(query ? `${path}?${query}` : path);
  }, [router]);

  return { searchParams, replaceState };
}
