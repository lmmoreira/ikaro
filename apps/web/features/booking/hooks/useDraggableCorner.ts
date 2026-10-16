'use client';

import {
  useMemo,
  useState,
  type Dispatch,
  type MouseEvent,
  type PointerEvent,
  type SetStateAction,
} from 'react';
import { nearestCorner, type FloatingFilterCorner } from '../model/floating-filter-corner';

// A movement of this many pixels or more is a drag; anything smaller is still a click, so opening
// and closing the popover behaves exactly as it did before the pill could move.
export const DRAG_THRESHOLD_PX = 6;

export interface DragOffset {
  readonly x: number;
  readonly y: number;
}

export interface DragHandlers {
  readonly onPointerDown: (event: PointerEvent<HTMLElement>) => void;
  readonly onPointerMove: (event: PointerEvent<HTMLElement>) => void;
  readonly onPointerUp: (event: PointerEvent<HTMLElement>) => void;
  readonly onPointerCancel: (event: PointerEvent<HTMLElement>) => void;
  readonly onLostPointerCapture: (event: PointerEvent<HTMLElement>) => void;
  readonly onClickCapture: (event: MouseEvent<HTMLElement>) => void;
}

interface DraggableCornerState {
  // The pointer's travel since it went down, while a real drag is under way; null otherwise.
  readonly offset: DragOffset | null;
  readonly isDragging: boolean;
  readonly handlers: DragHandlers;
}

// What the handlers remember between events. It lives in a ref: none of it is rendered.
interface PointerSession {
  readonly pointerId: number;
  readonly startX: number;
  readonly startY: number;
  dragging: boolean;
}

interface DragMemory {
  session: PointerSession | null;
  // Releasing a drag on the pill still fires a `click`; it must not toggle the popover.
  swallowNextClick: boolean;
}

type SetOffset = Dispatch<SetStateAction<DragOffset | null>>;

function finishDrag(
  memory: DragMemory,
  setOffset: SetOffset,
  onSnap: (corner: FloatingFilterCorner) => void,
  event: PointerEvent<HTMLElement>,
  snap: boolean,
): void {
  const session = memory.session;
  if (session?.pointerId !== event.pointerId) return;
  memory.session = null;
  setOffset(null);
  if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
    event.currentTarget.releasePointerCapture(event.pointerId);
  }
  if (!session.dragging) return;
  memory.swallowNextClick = true;
  if (!snap) return;
  onSnap(
    nearestCorner(
      { x: event.clientX, y: event.clientY },
      { width: window.innerWidth, height: window.innerHeight },
    ),
  );
}

function createDragHandlers(
  memory: DragMemory,
  setOffset: SetOffset,
  onSnap: (corner: FloatingFilterCorner) => void,
): DragHandlers {
  return {
    onPointerDown(event) {
      // A drag that ended without a click (released away from the pill) must not eat this one.
      memory.swallowNextClick = false;
      if (event.button !== 0) return;
      memory.session = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        dragging: false,
      };
      event.currentTarget.setPointerCapture?.(event.pointerId);
    },
    onPointerMove(event) {
      const session = memory.session;
      if (session?.pointerId !== event.pointerId) return;
      const x = event.clientX - session.startX;
      const y = event.clientY - session.startY;
      if (!session.dragging && Math.hypot(x, y) < DRAG_THRESHOLD_PX) return;
      session.dragging = true;
      setOffset({ x, y });
    },
    onPointerUp: (event) => finishDrag(memory, setOffset, onSnap, event, true),
    onPointerCancel: (event) => finishDrag(memory, setOffset, onSnap, event, false),
    onLostPointerCapture: (event) => finishDrag(memory, setOffset, onSnap, event, false),
    onClickCapture(event) {
      if (!memory.swallowNextClick) return;
      memory.swallowNextClick = false;
      event.stopPropagation();
      event.preventDefault();
    },
  };
}

// The pointer half of the movable floating filter: plain Pointer Events on the pill with pointer
// capture, no library. The pill is the only element that opts out of scrolling (`touch-none`).
// On release it reports the nearest corner through `onSnap`; a cancelled drag reports nothing.
export function useDraggableCorner(
  onSnap: (corner: FloatingFilterCorner) => void,
): DraggableCornerState {
  const [offset, setOffset] = useState<DragOffset | null>(null);
  const [memory] = useState<DragMemory>(() => ({ session: null, swallowNextClick: false }));
  const handlers = useMemo(() => createDragHandlers(memory, setOffset, onSnap), [memory, onSnap]);

  return { offset, isDragging: offset !== null, handlers };
}
