// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useNoShowAvailability } from './useNoShowAvailability';

// 10:00–10:30 UTC.
const booking = { scheduledAt: '2026-06-16T10:00:00.000Z', totalDurationMins: 30 };

describe('useNoShowAvailability', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('is unavailable before the end time and exposes the end time as the hint', () => {
    vi.setSystemTime(new Date('2026-06-16T09:00:00.000Z'));

    const { result } = renderHook(() => useNoShowAvailability(booking));

    expect(result.current.noShowAvailableAt).toEqual(expect.stringMatching(/\d{1,2}:30/));
    expect(result.current.noShowEndLabel).toBe(result.current.noShowAvailableAt);
  });

  it('is available once the end time has passed, but still names it for the 422 banner', () => {
    vi.setSystemTime(new Date('2026-06-16T12:00:00.000Z'));

    const { result } = renderHook(() => useNoShowAvailability(booking));

    expect(result.current.noShowAvailableAt).toBeNull();
    expect(result.current.noShowEndLabel).toEqual(expect.stringMatching(/\d{1,2}:30/));
  });

  it('enables itself when the end time arrives while the page is open', () => {
    vi.setSystemTime(new Date('2026-06-16T10:29:00.000Z'));
    const { result } = renderHook(() => useNoShowAvailability(booking));
    expect(result.current.noShowAvailableAt).not.toBeNull();

    act(() => {
      vi.advanceTimersByTime(61_000);
    });

    expect(result.current.noShowAvailableAt).toBeNull();
  });
});
