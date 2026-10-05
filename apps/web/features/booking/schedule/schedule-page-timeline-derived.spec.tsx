// @vitest-environment jsdom
import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { BOOKING_STATUS } from '@ikaro/types';
import type { ScheduleOpening, StaffBookingCardResponse, TenantBusinessHours } from '@ikaro/types';
import { useScheduleTimelineDerived } from './schedule-page-timeline-derived';
import type { TimelineEvent } from './schedule-timeline-events';

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
    assignedResources: [],
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

  it('ignores a booking dated before the displayed week in every day timeline (the bookings fetch starts one day early)', () => {
    const beforeWeek = makeBooking({
      bookingId: 'booking-before-week',
      scheduledAt: '2026-08-16T12:00:00.000Z',
    });
    const inWeek = makeBooking({ bookingId: 'booking-in-week' });
    const { result } = renderHook(() =>
      useScheduleTimelineDerived(baseInput({ visibleBookings: [beforeWeek, inWeek] })),
    );

    const bookingIds = (events: readonly TimelineEvent[]) =>
      events.flatMap((event) => (event.kind === 'booking' ? [event.booking.bookingId] : []));
    expect(bookingIds(result.current.selectedDayTimeline.events)).toEqual(['booking-in-week']);
    expect(bookingIds(result.current.weekTimelineCards[0].events)).toEqual(['booking-in-week']);
    expect(bookingIds(result.current.weekTimelineCards[1].events)).toEqual([]);
    expect(result.current.weekDayInfo.map((day) => day.dateKey)).toEqual([
      '2026-08-17',
      '2026-08-18',
    ]);
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

    it('shows every assigned resource on a matched Week-view booking, sourced from the booking itself', () => {
      const booking = makeBooking({
        scheduledAt: '2026-08-17T12:00:00.000Z',
        assignedResources: [
          { resourceId: 'res-camila', resourceType: 'STAFF', resourceName: 'Camila Duarte' },
        ],
      });
      const { result } = renderHook(() =>
        useScheduleTimelineDerived(
          baseInput({
            visibleBookings: [booking],
            selectedResourceIdSet: new Set(['res-camila']),
            bookingResourceIdsById: new Map([['booking-1', ['res-camila']]]),
          }),
        ),
      );

      const events = result.current.weekTimelineCards[0].events;
      expect(events).toHaveLength(1);
      expect(events[0].kind === 'booking' && events[0].resourceNames).toEqual(['Camila Duarte']);
    });

    it("shows a booking's assigned resources even when zero resources are checked (TD44-S2 round 3 — always show, not just when filtering)", () => {
      const booking = makeBooking({
        scheduledAt: '2026-08-17T12:00:00.000Z',
        assignedResources: [
          { resourceId: 'res-camila', resourceType: 'STAFF', resourceName: 'Camila Duarte' },
        ],
      });
      const { result } = renderHook(() =>
        useScheduleTimelineDerived(baseInput({ visibleBookings: [booking] })),
      );

      const events = result.current.weekTimelineCards[0].events;
      expect(events).toHaveLength(1);
      expect(events[0].kind === 'booking' && events[0].resourceNames).toEqual(['Camila Duarte']);
    });
  });

  describe('Grid coordinate unit, decoupled from the content-fit floor (TD44 Story 4)', () => {
    // The content-fit floor (DESKTOP_MIN_BLOCK_HEIGHT_PX/COMPACT_MIN_BLOCK_HEIGHT_PX) no longer
    // feeds into slotHeight at all as of Story 4 — it's applied per block instead (see
    // schedule-timeline-formatting.spec.ts's getBlockMinHeightPx coverage, plus
    // ScheduleTimelineEventRenderer.spec.tsx's own min-height assertion). This block now only
    // covers the plain grid unit these two boards pass through buildTimelineDayData.
    it('gives Day view (selectedDayTimeline) the plain 72px/30-min-slot unit (scale 1, TD44 Story 5 — base raised from 48)', () => {
      const { result } = renderHook(() => useScheduleTimelineDerived(baseInput()));
      expect(result.current.selectedDayTimeline.slotHeight).toBe(72);
    });

    it('gives Week view (weekTimelineCards) the plain scaled-down unit (scale 0.85, TD44 Story 4 live-testing correction — raised from 0.45; base raised 48 -> 72 in Story 5)', () => {
      const { result } = renderHook(() => useScheduleTimelineDerived(baseInput()));
      expect(result.current.weekTimelineCards[0].slotHeight).toBe(61);
    });
  });

  describe('shared hour axis across week day-cards (TD44 Story 3)', () => {
    function makeMultiDayBusinessHours(): TenantBusinessHours {
      const dayHours = { open: '09:00', close: '18:00' };
      return {
        timezone: 'America/Sao_Paulo',
        monday: dayHours,
        tuesday: dayHours,
        wednesday: dayHours,
        thursday: null,
        friday: null,
        saturday: null,
        sunday: null,
      };
    }

    function makeOpening(overrides: Partial<ScheduleOpening> = {}): ScheduleOpening {
      return {
        id: 'opening-1',
        date: '2026-08-18',
        startTime: '02:00',
        endTime: '04:00',
        notes: null,
        resourceId: null,
        ...overrides,
      };
    }

    it('gives every regular-hours day-card in a normal week the same shared window', () => {
      const { result } = renderHook(() =>
        useScheduleTimelineDerived(
          baseInput({
            weekDates: ['2026-08-17', '2026-08-18'], // Monday, Tuesday — both open
            businessHours: makeMultiDayBusinessHours(),
          }),
        ),
      );

      const [monday, tuesday] = result.current.weekTimelineCards;
      expect(monday.timelineStartMinutes).toBe(540);
      expect(monday.timelineEndMinutes).toBe(1080);
      expect(tuesday.timelineStartMinutes).toBe(540);
      expect(tuesday.timelineEndMinutes).toBe(1080);
    });

    it('keeps a day with an exceptional opening on its own independent window, not stretching the shared range', () => {
      const opening = makeOpening({ date: '2026-08-18' }); // Tuesday, 02:00-04:00

      const { result } = renderHook(() =>
        useScheduleTimelineDerived(
          baseInput({
            weekDates: ['2026-08-17', '2026-08-18'], // Monday (regular), Tuesday (exceptional)
            businessHours: makeMultiDayBusinessHours(),
            visibleOpenings: [opening],
          }),
        ),
      );

      const [monday, tuesday] = result.current.weekTimelineCards;
      // Monday's shared window must not stretch to cover Tuesday's 2am opening.
      expect(monday.timelineStartMinutes).toBe(540);
      expect(monday.timelineEndMinutes).toBe(1080);
      expect(tuesday.timelineStartMinutes).toBe(120);
      expect(tuesday.timelineEndMinutes).toBe(240);
      expect(tuesday.isOverriddenByOpening).toBe(true);
    });
  });

  describe('held-time strips (M18-S10)', () => {
    const gap = { source: 'SERVICE_BUFFER', minutes: 30, serviceName: 'Lavagem completa' } as const;
    const dayGrid = (date: string) => ({
      date,
      columns: [
        {
          resourceId: 'res-walace',
          name: 'Walace',
          type: 'STAFF' as const,
          blocks: [
            {
              startsAt: `${date}T12:00:00.000Z`,
              endsAt: `${date}T13:00:00.000Z`,
              kind: 'BOOKING' as const,
              refId: 'booking-1',
              gap,
            },
          ],
        },
      ],
    });
    const bufferEvents = (events: readonly TimelineEvent[]) =>
      events.filter((event) => event.kind === 'buffer');

    it('adds one strip under the booking in the merged Day timeline when the day-grid is available', () => {
      const { result } = renderHook(() =>
        useScheduleTimelineDerived(
          baseInput({
            visibleBookings: [makeBooking()],
            selectedDayGrid: dayGrid('2026-08-17'),
          }),
        ),
      );

      const strips = bufferEvents(result.current.selectedDayTimeline.events);
      expect(strips).toHaveLength(1);
      expect(strips[0]).toMatchObject({ resourceName: 'Walace', releasesAtLocalTime: '10:00' });
    });

    it('adds nothing without a day-grid (STAFF, or still loading)', () => {
      const { result } = renderHook(() =>
        useScheduleTimelineDerived(baseInput({ visibleBookings: [makeBooking()] })),
      );

      expect(bufferEvents(result.current.selectedDayTimeline.events)).toHaveLength(0);
      for (const card of result.current.weekTimelineCards) {
        expect(bufferEvents(card.events)).toHaveLength(0);
      }
    });

    it("adds the strip to the booking's own Week day-card only", () => {
      const { result } = renderHook(() =>
        useScheduleTimelineDerived(
          baseInput({
            visibleBookings: [makeBooking()],
            weekDayGrids: [dayGrid('2026-08-17'), { date: '2026-08-18', columns: [] }],
          }),
        ),
      );

      const [monday, tuesday] = result.current.weekTimelineCards;
      expect(bufferEvents(monday.events)).toHaveLength(1);
      expect(bufferEvents(tuesday.events)).toHaveLength(0);
    });
  });
});
