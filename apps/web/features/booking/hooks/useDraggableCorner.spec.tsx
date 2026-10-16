// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import type { MouseEvent, PointerEvent } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DRAG_THRESHOLD_PX, useDraggableCorner } from './useDraggableCorner';

// jsdom has no pointer capture, so the pill is a stub that records what the hook asks of it.
function pill() {
  return {
    setPointerCapture: vi.fn(),
    releasePointerCapture: vi.fn(),
    hasPointerCapture: vi.fn(() => true),
  };
}

function pointer(
  target: ReturnType<typeof pill>,
  clientX: number,
  clientY: number,
  overrides: Partial<{ pointerId: number; button: number }> = {},
): PointerEvent<HTMLElement> {
  return {
    pointerId: 1,
    button: 0,
    clientX,
    clientY,
    currentTarget: target,
    ...overrides,
  } as unknown as PointerEvent<HTMLElement>;
}

function click() {
  const event = { stopPropagation: vi.fn(), preventDefault: vi.fn() };
  return event as unknown as MouseEvent<HTMLElement> & typeof event;
}

beforeEach(() => {
  Object.defineProperty(window, 'innerWidth', { value: 1000, configurable: true });
  Object.defineProperty(window, 'innerHeight', { value: 800, configurable: true });
});

describe('useDraggableCorner', () => {
  it('treats a movement past the threshold as a drag and snaps to the nearest corner on release', () => {
    const onSnap = vi.fn();
    const { result } = renderHook(() => useDraggableCorner(onSnap));
    const target = pill();

    act(() => result.current.handlers.onPointerDown(pointer(target, 900, 700)));
    act(() => result.current.handlers.onPointerMove(pointer(target, 400, 100)));
    expect(result.current.isDragging).toBe(true);
    expect(result.current.offset).toEqual({ x: -500, y: -600 });

    act(() => result.current.handlers.onPointerUp(pointer(target, 100, 80)));

    expect(onSnap).toHaveBeenCalledTimes(1);
    expect(onSnap).toHaveBeenCalledWith('top-left');
    expect(result.current.isDragging).toBe(false);
    expect(result.current.offset).toBeNull();
    expect(target.setPointerCapture).toHaveBeenCalledWith(1);
    expect(target.releasePointerCapture).toHaveBeenCalledWith(1);
  });

  it('treats a movement below the threshold as a click and fires nothing else', () => {
    const onSnap = vi.fn();
    const { result } = renderHook(() => useDraggableCorner(onSnap));
    const target = pill();
    const tiny = DRAG_THRESHOLD_PX - 1;

    act(() => result.current.handlers.onPointerDown(pointer(target, 900, 700)));
    act(() => result.current.handlers.onPointerMove(pointer(target, 900 + tiny, 700)));
    act(() => result.current.handlers.onPointerUp(pointer(target, 900 + tiny, 700)));
    const clickEvent = click();
    act(() => result.current.handlers.onClickCapture(clickEvent));

    expect(onSnap).not.toHaveBeenCalled();
    expect(result.current.isDragging).toBe(false);
    expect(result.current.offset).toBeNull();
    expect(clickEvent.stopPropagation).not.toHaveBeenCalled();
    expect(clickEvent.preventDefault).not.toHaveBeenCalled();
  });

  it('swallows the click that follows a real drag so the popover does not toggle', () => {
    const { result } = renderHook(() => useDraggableCorner(vi.fn()));
    const target = pill();

    act(() => result.current.handlers.onPointerDown(pointer(target, 900, 700)));
    act(() => result.current.handlers.onPointerMove(pointer(target, 300, 100)));
    act(() => result.current.handlers.onPointerUp(pointer(target, 300, 100)));
    const afterDrag = click();
    act(() => result.current.handlers.onClickCapture(afterDrag));

    expect(afterDrag.stopPropagation).toHaveBeenCalledTimes(1);
    expect(afterDrag.preventDefault).toHaveBeenCalledTimes(1);

    // Only that one click: the next, ordinary click goes through.
    const ordinary = click();
    act(() => result.current.handlers.onClickCapture(ordinary));
    expect(ordinary.stopPropagation).not.toHaveBeenCalled();
  });

  it('does not let a drag released away from the pill eat the next real click', () => {
    const { result } = renderHook(() => useDraggableCorner(vi.fn()));
    const target = pill();

    act(() => result.current.handlers.onPointerDown(pointer(target, 900, 700)));
    act(() => result.current.handlers.onPointerMove(pointer(target, 300, 100)));
    act(() => result.current.handlers.onPointerUp(pointer(target, 300, 100)));
    // No click ever arrived for that drag; the user presses the pill again.
    act(() => result.current.handlers.onPointerDown(pointer(target, 300, 100)));
    act(() => result.current.handlers.onPointerUp(pointer(target, 300, 100)));
    const realClick = click();
    act(() => result.current.handlers.onClickCapture(realClick));

    expect(realClick.stopPropagation).not.toHaveBeenCalled();
  });

  it.each([
    ['pointercancel', 'onPointerCancel'],
    ['lostpointercapture', 'onLostPointerCapture'],
  ] as const)('ends the drag on %s without moving the pill', (_name, handler) => {
    const onSnap = vi.fn();
    const { result } = renderHook(() => useDraggableCorner(onSnap));
    const target = pill();

    act(() => result.current.handlers.onPointerDown(pointer(target, 900, 700)));
    act(() => result.current.handlers.onPointerMove(pointer(target, 300, 100)));
    expect(result.current.isDragging).toBe(true);
    act(() => result.current.handlers[handler](pointer(target, 300, 100)));

    expect(onSnap).not.toHaveBeenCalled();
    expect(result.current.isDragging).toBe(false);
    expect(result.current.offset).toBeNull();
  });

  it('ignores a second pointer and a non-primary button', () => {
    const onSnap = vi.fn();
    const { result } = renderHook(() => useDraggableCorner(onSnap));
    const target = pill();

    act(() => result.current.handlers.onPointerDown(pointer(target, 900, 700, { button: 2 })));
    act(() => result.current.handlers.onPointerMove(pointer(target, 300, 100)));
    expect(result.current.isDragging).toBe(false);

    act(() => result.current.handlers.onPointerDown(pointer(target, 900, 700)));
    act(() => result.current.handlers.onPointerMove(pointer(target, 300, 100, { pointerId: 2 })));
    expect(result.current.isDragging).toBe(false);
    act(() => result.current.handlers.onPointerUp(pointer(target, 300, 100, { pointerId: 2 })));
    expect(onSnap).not.toHaveBeenCalled();
  });

  it('keeps working where the browser has no pointer capture', () => {
    const { result } = renderHook(() => useDraggableCorner(vi.fn()));
    const bare = {} as ReturnType<typeof pill>;

    expect(() => {
      act(() => result.current.handlers.onPointerDown(pointer(bare, 900, 700)));
      act(() => result.current.handlers.onPointerMove(pointer(bare, 300, 100)));
      act(() => result.current.handlers.onPointerUp(pointer(bare, 300, 100)));
    }).not.toThrow();
  });
});
