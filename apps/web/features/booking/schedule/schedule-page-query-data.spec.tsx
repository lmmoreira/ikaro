// @vitest-environment jsdom
import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  ScheduleClosureListResponse,
  ScheduleOpeningListResponse,
  StaffBookingListResponse,
} from '@ikaro/types';
import { useScheduleQueryData } from './schedule-page-query-data';

const scheduleHooks = vi.hoisted(() => ({
  useScheduleClosures: vi.fn(),
  useScheduleOpenings: vi.fn(),
  useWeekBookings: vi.fn(),
}));

vi.mock('@/features/booking/schedule/useSchedule', () => scheduleHooks);

function emptyClosures(): ScheduleClosureListResponse {
  return { items: [] };
}
function emptyOpenings(): ScheduleOpeningListResponse {
  return { items: [] };
}
function emptyBookings(): StaffBookingListResponse {
  return { items: [], total: 0, page: 1, limit: 50 };
}

beforeEach(() => {
  vi.clearAllMocks();
  scheduleHooks.useScheduleClosures.mockReturnValue({ data: emptyClosures() });
  scheduleHooks.useScheduleOpenings.mockReturnValue({ data: emptyOpenings() });
  scheduleHooks.useWeekBookings.mockReturnValue({ data: emptyBookings() });
});

describe('useScheduleQueryData', () => {
  it('derives weekEndKey/weekDates from weekStartKey and fetches the week range', () => {
    renderHook(() =>
      useScheduleQueryData(
        '2026-08-17',
        '2026-08-17',
        emptyClosures(),
        emptyOpenings(),
        emptyBookings(),
      ),
    );

    expect(scheduleHooks.useScheduleClosures).toHaveBeenCalledWith(
      '2026-08-17',
      '2026-08-23',
      emptyClosures(),
    );
    expect(scheduleHooks.useWeekBookings).toHaveBeenCalledWith(
      '2026-08-17',
      '2026-08-23',
      emptyBookings(),
    );
  });

  it('passes the server-fetched initial data as a placeholder only for the initial week', () => {
    renderHook(() =>
      useScheduleQueryData(
        '2026-08-24',
        '2026-08-17',
        emptyClosures(),
        emptyOpenings(),
        emptyBookings(),
      ),
    );

    expect(scheduleHooks.useScheduleClosures).toHaveBeenCalledWith(
      '2026-08-24',
      '2026-08-30',
      undefined,
    );
    expect(scheduleHooks.useScheduleOpenings).toHaveBeenCalledWith(
      '2026-08-24',
      '2026-08-30',
      undefined,
    );
    expect(scheduleHooks.useWeekBookings).toHaveBeenCalledWith(
      '2026-08-24',
      '2026-08-30',
      undefined,
    );
  });

  it("unwraps each query's .items into the returned shape", () => {
    const closure = {
      id: 'closure-1',
      date: '2026-08-17',
      startTime: null,
      endTime: null,
      reason: 'MAINTENANCE' as const,
      notes: null,
    };
    scheduleHooks.useScheduleClosures.mockReturnValue({ data: { items: [closure] } });

    const { result } = renderHook(() =>
      useScheduleQueryData(
        '2026-08-17',
        '2026-08-17',
        emptyClosures(),
        emptyOpenings(),
        emptyBookings(),
      ),
    );

    expect(result.current.visibleClosures).toEqual([closure]);
    expect(result.current.weekDates).toHaveLength(7);
    expect(result.current.weekDates[0]).toBe('2026-08-17');
  });
});
