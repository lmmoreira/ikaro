'use client';

import { createContext, useContext } from 'react';
import type { DragHandlers } from '../../hooks/useDraggableCorner';
import type { FloatingFilterCorner } from '../../model/floating-filter-corner';

export interface FloatingFilterDockValue {
  readonly corner: FloatingFilterCorner;
  readonly setCorner: (corner: FloatingFilterCorner) => void;
  // The pill's pointer handlers: dragging any pill of the dock moves the whole dock.
  readonly dragHandlers: DragHandlers;
  readonly isDragging: boolean;
}

export const FloatingFilterDockContext = createContext<FloatingFilterDockValue | null>(null);

// A FloatingFilterMenu only makes sense inside a dock: the dock owns the corner, so a menu
// rendered without one would float unplaced and have no "Posição" row. Failing loudly here beats
// a filter that silently sits in the wrong place.
export function useFloatingFilterDock(): FloatingFilterDockValue {
  const dock = useContext(FloatingFilterDockContext);
  if (!dock) {
    throw new Error('FloatingFilterMenu must be rendered inside a FloatingFilterDock');
  }
  return dock;
}
