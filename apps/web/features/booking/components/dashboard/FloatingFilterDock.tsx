'use client';

import { useMemo, type ReactNode } from 'react';
import { cn } from '@/shared/utils/cn';
import { useDraggableCorner } from '../../hooks/useDraggableCorner';
import { dockClassName } from '../../model/floating-filter-corner';
import {
  useFloatingFilterCorner,
  type FloatingFilterPageKey,
} from '../../schedule/floating-filter-preferences';
import {
  FloatingFilterDockContext,
  type FloatingFilterDockValue,
} from './floating-filter-dock-context';

interface FloatingFilterDockProps {
  // Which page's remembered corner this dock uses (per tenant and per page).
  readonly pageKey: FloatingFilterPageKey;
  // The page's FloatingFilterMenus, nearest the corner LAST: the dock stacks them along the
  // corner in this order, so Horários lists the resource filter before the status filter.
  readonly children: ReactNode;
}

// The fixed container every floating filter of a page lives in (M23-S50). It owns the corner, the
// drag and the stacking, so a menu never computes its own offset: the page's filters travel
// together and cannot overlap, whichever corner they are in.
export function FloatingFilterDock({
  pageKey,
  children,
}: FloatingFilterDockProps): React.JSX.Element {
  const { corner, setCorner } = useFloatingFilterCorner(pageKey);
  const { offset, isDragging, handlers } = useDraggableCorner(setCorner);

  const value = useMemo<FloatingFilterDockValue>(
    () => ({ corner, setCorner, dragHandlers: handlers, isDragging }),
    [corner, setCorner, handlers, isDragging],
  );

  return (
    <FloatingFilterDockContext.Provider value={value}>
      <div
        data-testid="floating-filter-dock"
        data-corner={corner}
        className={cn(
          'fixed z-30 flex w-fit max-w-[calc(100vw-2rem)] gap-2.5',
          dockClassName(corner),
          isDragging && 'opacity-90',
        )}
        style={offset ? { transform: `translate(${offset.x}px, ${offset.y}px)` } : undefined}
      >
        {children}
      </div>
    </FloatingFilterDockContext.Provider>
  );
}
