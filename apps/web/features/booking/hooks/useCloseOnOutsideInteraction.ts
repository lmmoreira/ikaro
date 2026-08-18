'use client';

import { useEffect, useRef, type RefObject } from 'react';

// Extracted from SchedulePage (TD37-S5A) — the status-filter popover's outside-click/Escape
// dismissal is a generic, self-contained interaction pattern. `setActive` must be a state setter
// (stable identity), not an arbitrary callback — passing an inline arrow function here would
// reproduce the HotsiteEditor infinite-render-loop class of bug (TD37-S5A precedent).
export function useCloseOnOutsideInteraction<T extends HTMLElement>(
  active: boolean,
  setActive: (active: boolean) => void,
): RefObject<T | null> {
  const ref = useRef<T>(null);

  useEffect(() => {
    if (!active) return;

    function handleDocumentMouseDown(event: MouseEvent): void {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (ref.current?.contains(target)) return;
      setActive(false);
    }

    function handleDocumentKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Escape') {
        setActive(false);
      }
    }

    document.addEventListener('mousedown', handleDocumentMouseDown);
    document.addEventListener('keydown', handleDocumentKeyDown);

    return () => {
      document.removeEventListener('mousedown', handleDocumentMouseDown);
      document.removeEventListener('keydown', handleDocumentKeyDown);
    };
  }, [active, setActive]);

  return ref;
}
