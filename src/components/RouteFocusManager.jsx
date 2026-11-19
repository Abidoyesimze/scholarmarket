'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';

export default function RouteFocusManager() {
  const pathname = usePathname();

  useEffect(() => {
    const main = document.getElementById('main');
    const heading = main?.querySelector('h1');
    (main || heading)?.focus({ preventScroll: true });
  }, [pathname]);

  return null;
}
