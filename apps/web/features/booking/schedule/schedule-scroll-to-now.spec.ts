// @vitest-environment jsdom
import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { resolveNowMarkerTopPx, useScrollToNowOnce } from './schedule-scroll-to-now';

describe('resolveNowMarkerTopPx', () => {
  const timeline = { timelineStartMinutes: 540, timelineEndMinutes: 1080, slotHeight: 48 };

  it('positions the marker 1 hour before now when now is well within the active window', () => {
    // now = 660 (11:00) -> target = 600 (10:00) -> (600-540)/30*48 = 96px
    expect(resolveNowMarkerTopPx(timeline, 30, 660)).toBe(96);
  });

  it('clamps the target at the window start when now is within 1 hour of opening', () => {
    // now = 570 (09:30) -> target would be 510, clamped to timelineStartMinutes (540) -> 0px
    expect(resolveNowMarkerTopPx(timeline, 30, 570)).toBe(0);
  });

  it('clamps now itself to the window start when now is before opening', () => {
    // now = 300 (05:00), before the window entirely -> clampedNow=540 -> target clamped to 540 -> 0px
    expect(resolveNowMarkerTopPx(timeline, 30, 300)).toBe(0);
  });

  it('clamps now itself to the window end when now is after closing', () => {
    // now = 1200, after the window entirely -> clampedNow=1080 -> target=1020 -> (1020-540)/30*48=768
    expect(resolveNowMarkerTopPx(timeline, 30, 1200)).toBe(768);
  });
});

describe('useScrollToNowOnce', () => {
  function makeMarkerElement(): HTMLDivElement {
    const element = document.createElement('div');
    // jsdom's own scrollIntoView (via the global test-setup polyfill) is a non-writable prototype
    // property — a plain `element.scrollIntoView = vi.fn()` throws in strict mode. Shadow it with
    // an own, writable property instead.
    Object.defineProperty(element, 'scrollIntoView', {
      value: vi.fn(),
      configurable: true,
      writable: true,
    });
    return element;
  }

  it('does not call scrollIntoView when disabled', () => {
    const { result, rerender } = renderHook(
      ({ enabled, dateKey }: { enabled: boolean; dateKey: string }) =>
        useScrollToNowOnce(enabled, dateKey),
      { initialProps: { enabled: false, dateKey: '2026-08-17' } },
    );
    const element = makeMarkerElement();
    result.current.current = element;
    rerender({ enabled: false, dateKey: '2026-08-17' });

    expect(element.scrollIntoView).not.toHaveBeenCalled();
  });

  it('calls scrollIntoView once the marker is mounted and enabled is true', () => {
    const { result, rerender } = renderHook(
      ({ enabled, dateKey }: { enabled: boolean; dateKey: string }) =>
        useScrollToNowOnce(enabled, dateKey),
      { initialProps: { enabled: true, dateKey: '2026-08-17' } },
    );
    const element = makeMarkerElement();
    result.current.current = element;
    rerender({ enabled: true, dateKey: '2026-08-17' });

    expect(element.scrollIntoView).toHaveBeenCalledTimes(1);
    expect(element.scrollIntoView).toHaveBeenCalledWith({ block: 'center', behavior: 'auto' });
  });

  it('does not re-fire on a subsequent render with the same dateKey (e.g. a data refetch)', () => {
    const { result, rerender } = renderHook(
      ({ enabled, dateKey }: { enabled: boolean; dateKey: string }) =>
        useScrollToNowOnce(enabled, dateKey),
      { initialProps: { enabled: true, dateKey: '2026-08-17' } },
    );
    const element = makeMarkerElement();
    result.current.current = element;
    rerender({ enabled: true, dateKey: '2026-08-17' });
    rerender({ enabled: true, dateKey: '2026-08-17' });
    rerender({ enabled: true, dateKey: '2026-08-17' });

    expect(element.scrollIntoView).toHaveBeenCalledTimes(1);
  });

  it('fires again when dateKey changes (a genuine date/week navigation)', () => {
    const { result, rerender } = renderHook(
      ({ enabled, dateKey }: { enabled: boolean; dateKey: string }) =>
        useScrollToNowOnce(enabled, dateKey),
      { initialProps: { enabled: true, dateKey: '2026-08-17' } },
    );
    const firstElement = makeMarkerElement();
    result.current.current = firstElement;
    rerender({ enabled: true, dateKey: '2026-08-17' });
    expect(firstElement.scrollIntoView).toHaveBeenCalledTimes(1);

    const secondElement = makeMarkerElement();
    result.current.current = secondElement;
    rerender({ enabled: true, dateKey: '2026-08-24' });

    expect(secondElement.scrollIntoView).toHaveBeenCalledTimes(1);
  });

  it('fires again when the marker node changes even though dateKey stays the same (e.g. switching Week to Day view without a date change)', () => {
    const { result, rerender } = renderHook(
      ({ enabled, dateKey }: { enabled: boolean; dateKey: string }) =>
        useScrollToNowOnce(enabled, dateKey),
      { initialProps: { enabled: true, dateKey: '2026-08-17' } },
    );
    const weekViewElement = makeMarkerElement();
    result.current.current = weekViewElement;
    rerender({ enabled: true, dateKey: '2026-08-17' });
    expect(weekViewElement.scrollIntoView).toHaveBeenCalledTimes(1);

    // Same dateKey, but a different DOM node — the old marker was unmounted (e.g. the view
    // switched from Week to Day) and a new one took its place. A dateKey-only guard would
    // wrongly treat this as "already scrolled".
    const dayViewElement = makeMarkerElement();
    result.current.current = dayViewElement;
    rerender({ enabled: true, dateKey: '2026-08-17' });

    expect(dayViewElement.scrollIntoView).toHaveBeenCalledTimes(1);
  });

  it('does not re-fire for the same node reused across renders with the same dateKey', () => {
    const { result, rerender } = renderHook(
      ({ enabled, dateKey }: { enabled: boolean; dateKey: string }) =>
        useScrollToNowOnce(enabled, dateKey),
      { initialProps: { enabled: true, dateKey: '2026-08-17' } },
    );
    const element = makeMarkerElement();
    result.current.current = element;
    rerender({ enabled: true, dateKey: '2026-08-17' });
    rerender({ enabled: true, dateKey: '2026-08-17' });

    expect(element.scrollIntoView).toHaveBeenCalledTimes(1);
  });
});
