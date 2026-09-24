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
  useScheduleWeekDayGrid: vi.fn(),
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
  scheduleHooks.useScheduleWeekDayGrid.mockReturnValue({
    data: [],
    isError: false,
    error: undefined,
  });
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
        [],
      ),
    );

    expect(scheduleHooks.useScheduleClosures).toHaveBeenCalledWith(
      '2026-08-17',
      '2026-08-23',
      emptyClosures(),
      [],
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
        [],
      ),
    );

    expect(scheduleHooks.useScheduleClosures).toHaveBeenCalledWith(
      '2026-08-24',
      '2026-08-30',
      undefined,
      [],
    );
    expect(scheduleHooks.useScheduleOpenings).toHaveBeenCalledWith(
      '2026-08-24',
      '2026-08-30',
      undefined,
      [],
    );
    expect(scheduleHooks.useWeekBookings).toHaveBeenCalledWith(
      '2026-08-24',
      '2026-08-30',
      undefined,
    );
  });

  it('does not use the server-fetched initial data as a placeholder when a resource is selected, even on the initial week', () => {
    renderHook(() =>
      useScheduleQueryData(
        '2026-08-17',
        '2026-08-17',
        emptyClosures(),
        emptyOpenings(),
        emptyBookings(),
        ['res-1'],
      ),
    );

    expect(scheduleHooks.useScheduleClosures).toHaveBeenCalledWith(
      '2026-08-17',
      '2026-08-23',
      undefined,
      ['res-1'],
    );
    expect(scheduleHooks.useScheduleOpenings).toHaveBeenCalledWith(
      '2026-08-17',
      '2026-08-23',
      undefined,
      ['res-1'],
    );
  });

  it('still uses the server-fetched initial bookings on the initial week even when a resource is selected (bookings are not resource-scoped)', () => {
    renderHook(() =>
      useScheduleQueryData(
        '2026-08-17',
        '2026-08-17',
        emptyClosures(),
        emptyOpenings(),
        emptyBookings(),
        ['res-1'],
      ),
    );

    expect(scheduleHooks.useWeekBookings).toHaveBeenCalledWith(
      '2026-08-17',
      '2026-08-23',
      emptyBookings(),
    );
  });

  it("does not fall back to the stale tenant-wide initial data while a selected resource's query is still loading", () => {
    const tenantWideClosure = {
      id: 'closure-tenant-wide',
      date: '2026-08-17',
      startTime: null,
      endTime: null,
      reason: 'MAINTENANCE' as const,
      notes: null,
      resourceId: null,
    };
    const tenantWideOpening = {
      id: 'opening-tenant-wide',
      date: '2026-08-18',
      startTime: '09:00',
      endTime: '12:00',
      notes: null,
      resourceId: null,
    };
    // Simulates the resource-scoped query still in flight (React Query returns `data: undefined`
    // until it resolves) — the fallback must not leak the tenant-wide fixture below into view.
    scheduleHooks.useScheduleClosures.mockReturnValue({ data: undefined });
    scheduleHooks.useScheduleOpenings.mockReturnValue({ data: undefined });

    const { result } = renderHook(() =>
      useScheduleQueryData(
        '2026-08-17',
        '2026-08-17',
        { items: [tenantWideClosure] },
        { items: [tenantWideOpening] },
        emptyBookings(),
        ['res-1'],
      ),
    );

    expect(result.current.visibleClosures).toEqual([]);
    expect(result.current.visibleOpenings).toEqual([]);
  });

  it('surfaces a fetch error and falls back to an empty list, instead of silently rendering stale/empty data as if it were valid', () => {
    scheduleHooks.useScheduleClosures.mockReturnValue({
      isError: true,
      error: new Error('closures boom'),
    });

    const { result } = renderHook(() =>
      useScheduleQueryData(
        '2026-08-17',
        '2026-08-17',
        emptyClosures(),
        emptyOpenings(),
        emptyBookings(),
        [],
      ),
    );

    expect(result.current.scheduleFetchError).toBeInstanceOf(Error);
    expect(result.current.visibleClosures).toEqual([]);
  });

  it('returns no fetch error when every query succeeds', () => {
    const { result } = renderHook(() =>
      useScheduleQueryData(
        '2026-08-17',
        '2026-08-17',
        emptyClosures(),
        emptyOpenings(),
        emptyBookings(),
        [],
      ),
    );

    expect(result.current.scheduleFetchError).toBeNull();
  });

  it("unwraps each query's .items into the returned shape", () => {
    const closure = {
      id: 'closure-1',
      date: '2026-08-17',
      startTime: null,
      endTime: null,
      reason: 'MAINTENANCE' as const,
      notes: null,
      resourceId: null,
    };
    scheduleHooks.useScheduleClosures.mockReturnValue({ data: { items: [closure] } });

    const { result } = renderHook(() =>
      useScheduleQueryData(
        '2026-08-17',
        '2026-08-17',
        emptyClosures(),
        emptyOpenings(),
        emptyBookings(),
        [],
      ),
    );

    expect(result.current.visibleClosures).toEqual([closure]);
    expect(result.current.weekDates).toHaveLength(7);
    expect(result.current.weekDates[0]).toBe('2026-08-17');
  });

  describe('week-range day-grid fetch (TD44 Story 1)', () => {
    it('fetches the week-range day-grid for every visible day, gated on the selected resources', () => {
      renderHook(() =>
        useScheduleQueryData(
          '2026-08-17',
          '2026-08-17',
          emptyClosures(),
          emptyOpenings(),
          emptyBookings(),
          ['res-1'],
        ),
      );

      expect(scheduleHooks.useScheduleWeekDayGrid).toHaveBeenCalledWith(
        expect.arrayContaining(['2026-08-17', '2026-08-23']),
        ['res-1'],
      );
    });

    it('returns an empty bookingResourceIdsById when no resources are selected, regardless of fetched data', () => {
      scheduleHooks.useScheduleWeekDayGrid.mockReturnValue({
        data: [
          {
            date: '2026-08-17',
            columns: [
              {
                resourceId: 'res-1',
                name: 'Camila',
                type: 'STAFF',
                blocks: [{ startsAt: '', endsAt: '', kind: 'BOOKING', refId: 'booking-1' }],
              },
            ],
          },
        ],
        isError: false,
        error: undefined,
      });

      const { result } = renderHook(() =>
        useScheduleQueryData(
          '2026-08-17',
          '2026-08-17',
          emptyClosures(),
          emptyOpenings(),
          emptyBookings(),
          [],
        ),
      );

      expect(result.current.bookingResourceIdsById).toEqual(new Map());
    });

    it('builds bookingResourceIdsById from the fetched day-grid responses once a resource is selected', () => {
      scheduleHooks.useScheduleWeekDayGrid.mockReturnValue({
        data: [
          {
            date: '2026-08-17',
            columns: [
              {
                resourceId: 'res-1',
                name: 'Camila',
                type: 'STAFF',
                blocks: [{ startsAt: '', endsAt: '', kind: 'BOOKING', refId: 'booking-1' }],
              },
            ],
          },
        ],
        isError: false,
        error: undefined,
      });

      const { result } = renderHook(() =>
        useScheduleQueryData(
          '2026-08-17',
          '2026-08-17',
          emptyClosures(),
          emptyOpenings(),
          emptyBookings(),
          ['res-1'],
        ),
      );

      expect(result.current.bookingResourceIdsById).toEqual(new Map([['booking-1', ['res-1']]]));
    });

    it('surfaces a week-day-grid fetch error the same way a closures/openings error does', () => {
      scheduleHooks.useScheduleWeekDayGrid.mockReturnValue({
        data: undefined,
        isError: true,
        error: new Error('day-grid boom'),
      });

      const { result } = renderHook(() =>
        useScheduleQueryData(
          '2026-08-17',
          '2026-08-17',
          emptyClosures(),
          emptyOpenings(),
          emptyBookings(),
          ['res-1'],
        ),
      );

      expect(result.current.scheduleFetchError).toBeInstanceOf(Error);
    });
  });
});
