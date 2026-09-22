'use client';

import { useEffect, useState } from 'react';

// Extracted from SchedulePage (TD37-S5A) — a small, generic media-query hook used only by the
// schedule page's desktop/mobile view-mode default.
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    const mediaQuery = globalThis.window?.matchMedia?.(query);
    if (!mediaQuery) return;

    const updateMatches = () => setMatches(mediaQuery.matches);

    updateMatches();

    mediaQuery.addEventListener('change', updateMatches);
    return () => mediaQuery.removeEventListener('change', updateMatches);
  }, [query]);

  return matches;
}
