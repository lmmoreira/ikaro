// @vitest-environment jsdom
import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { BOOKING_STATUS } from '@ikaro/types';
import type { StaffBookingCardResponse, TenantBusinessHours } from '@ikaro/types';
import { useScheduleTimelineDerived } from './schedule-page-timeline-derived';

function makeBusinessHours(): TenantBusinessHours {
  return {
    timezone: 'America/Sao_Paulo',
    monday: { open: '09:00', close: '18:00' },
    tuesday: null,
    wednesday: null,
    thursday: null,
    friday: null,
    saturday: null,
    sunday: null,
  };
}

function makeBooking(overrides: Partial<StaffBookingCardResponse> = {}): StaffBookingCardResponse {
  return {
    bookingId: 'booking-1',
    status: BOOKING_STATUS.APPROVED,
    scheduledAt: '2026-08-17T12:00:00.000Z',
    contactName: 'João Silva',
    serviceNames: ['Lavagem completa'],
    totalPrice: { amount: 100, currency: 'BRL' },
    totalDurationMins: 30,
    isCustomer: false,
    ...overrides,
  };
}

function baseInput(overrides: Partial<Parameters<typeof useScheduleTimelineDerived>[0]> = {}) {
  return {
    weekDates: ['2026-08-17', '2026-08-18'],
    visibleClosures: [],
    visibleOpenings: [],
    visibleBookings: [] as StaffBookingCardResponse[],
    businessHours: makeBusinessHours(),
    timezone: 'America/Sao_Paulo',
    slotGranularityMinutes: 30,
    selectedDateKey: '2026-08-17',
    resourceNameById: new Map<string, string>(),
    selectedResourceIdSet: new Set<string>(),
    bookingResourceIdsById: new Map<string, readonly string[]>(),
    ...overrides,
  };
}

describe('useScheduleTimelineDerived', () => {
  it('builds weekDayInfo for every date, marking closed days correctly', () => {
    const { result } = renderHook(() => useScheduleTimelineDerived(baseInput()));
    expect(result.current.weekDayInfo).toEqual([
      {
        dateKey: '2026-08-17',
        opening: null,
        hours: { open: '09:00', close: '18:00' },
        isClosed: false,
      },
      { dateKey: '2026-08-18', opening: null, hours: null, isClosed: true },
    ]);
    expect(result.current.dimmedDates).toEqual(new Set(['2026-08-18']));
  });

  it('collects activeDates from bookings/openings/closures', () => {
    const booking = makeBooking({ scheduledAt: '2026-08-17T12:00:00.000Z' });
    const { result } = renderHook(() =>
      useScheduleTimelineDerived(baseInput({ visibleBookings: [booking] })),
    );
    expect(result.current.activeDates).toEqual(new Set(['2026-08-17']));
  });

  it('builds selectedDayTimeline for the selected date and one weekTimelineCards entry per week date', () => {
    const { result } = renderHook(() => useScheduleTimelineDerived(baseInput()));
    expect(result.current.selectedDayTimeline.selectedDayClosed).toBe(false);
    expect(result.current.weekTimelineCards).toHaveLength(2);
    expect(result.current.weekTimelineCards[1].selectedDayClosed).toBe(true);
  });

  it('recomputes selectedDayTimeline when selectedDateKey changes to a different day', () => {
    const input = baseInput();
    const { result, rerender } = renderHook(
      (props: Parameters<typeof useScheduleTimelineDerived>[0]) =>
        useScheduleTimelineDerived(props),
      { initialProps: input },
    );
    expect(result.current.selectedDayTimeline.selectedDayClosed).toBe(false);

    rerender({ ...input, selectedDateKey: '2026-08-18' });

    expect(result.current.selectedDayTimeline.selectedDayClosed).toBe(true);
  });

  it('does not recompute weekDayInfo when only selectedDateKey changes and every other input stays referentially stable', () => {
    const input = baseInput();
    const { result, rerender } = renderHook(
      (props: Parameters<typeof useScheduleTimelineDerived>[0]) =>
        useScheduleTimelineDerived(props),
      { initialProps: input },
    );
    const initialWeekDayInfo = result.current.weekDayInfo;

    rerender({ ...input, selectedDateKey: '2026-08-18' });

    expect(result.current.weekDayInfo).toBe(initialWeekDayInfo);
  });

  describe('Week view resource filter/badges (TD44 Story 1)', () => {
    it('leaves weekTimelineCards unfiltered/unbadged when selectedResourceIdSet is empty (non-regression)', () => {
      const booking = makeBooking({ scheduledAt: '2026-08-17T12:00:00.000Z' });
      const { result } = renderHook(() =>
        useScheduleTimelineDerived(baseInput({ visibleBookings: [booking] })),
      );

      const events = result.current.weekTimelineCards[0].events;
      expect(events).toHaveLength(1);
      expect(events[0].kind === 'booking' && events[0].resourceNames).toEqual([]);
    });

    it('never filters/badges selectedDayTimeline (Day view), only weekTimelineCards', () => {
      const booking = makeBooking({ scheduledAt: '2026-08-17T12:00:00.000Z' });
      const { result } = renderHook(() =>
        useScheduleTimelineDerived(
          baseInput({
            visibleBookings: [booking],
            selectedResourceIdSet: new Set(['res-camila']),
            bookingResourceIdsById: new Map(),
          }),
        ),
      );

      // Day view's own merged timeline is unaffected by the resource filter at this layer — it
      // still shows the booking, since Day view's resource-scoped case renders through the
      // separate ScheduleResourceColumnsBoard instead.
      expect(result.current.selectedDayTimeline.events).toHaveLength(1);
    });

    it('excludes a Week-view booking with no checked-resource match once 1+ resources are checked', () => {
      const booking = makeBooking({ scheduledAt: '2026-08-17T12:00:00.000Z' });
      const { result } = renderHook(() =>
        useScheduleTimelineDerived(
          baseInput({
            visibleBookings: [booking],
            selectedResourceIdSet: new Set(['res-camila']),
            bookingResourceIdsById: new Map(),
          }),
        ),
      );

      expect(result.current.weekTimelineCards[0].events).toHaveLength(0);
    });

    it('resolves resourceIds to display names and badges the matched Week-view booking', () => {
      const booking = makeBooking({ scheduledAt: '2026-08-17T12:00:00.000Z' });
      const { result } = renderHook(() =>
        useScheduleTimelineDerived(
          baseInput({
            visibleBookings: [booking],
            resourceNameById: new Map([['res-camila', 'Camila Duarte']]),
            selectedResourceIdSet: new Set(['res-camila']),
            bookingResourceIdsById: new Map([['booking-1', ['res-camila']]]),
          }),
        ),
      );

      const events = result.current.weekTimelineCards[0].events;
      expect(events).toHaveLength(1);
      expect(events[0].kind === 'booking' && events[0].resourceNames).toEqual(['Camila Duarte']);
    });
  });
});
