import { describe, expect, it } from 'vitest';
import type {
  DayGridColumn,
  ScheduleClosure,
  ScheduleOpening,
  StaffBookingCardResponse,
  TenantBusinessHours,
} from '@ikaro/types';
import { BOOKING_STATUS } from '@ikaro/types';
import { buildResourceColumns } from './schedule-resource-columns';

function makeBusinessHours(overrides: Partial<TenantBusinessHours> = {}): TenantBusinessHours {
  return {
    timezone: 'America/Sao_Paulo',
    monday: { open: '09:00', close: '18:00' },
    tuesday: null,
    wednesday: null,
    thursday: null,
    friday: null,
    saturday: null,
    sunday: null,
    ...overrides,
  };
}

function makeBooking(overrides: Partial<StaffBookingCardResponse> = {}): StaffBookingCardResponse {
  return {
    bookingId: 'booking-1',
    status: BOOKING_STATUS.APPROVED,
    scheduledAt: '2026-08-17T12:00:00.000Z', // 09:00 America/Sao_Paulo
    contactName: 'João Silva',
    serviceNames: ['Corte'],
    totalPrice: { amount: 100, currency: 'BRL' },
    totalDurationMins: 30,
    isCustomer: false,
    assignedResources: [],
    ...overrides,
  };
}

function makeClosure(overrides: Partial<ScheduleClosure> = {}): ScheduleClosure {
  return {
    id: 'closure-1',
    date: '2026-08-17',
    startTime: '12:00',
    endTime: '12:30',
    reason: 'MAINTENANCE',
    notes: null,
    resourceId: null,
    ...overrides,
  };
}

function makeDayGridColumn(overrides: Partial<DayGridColumn> = {}): DayGridColumn {
  return {
    resourceId: 'res-camila',
    name: 'Camila Duarte',
    type: 'STAFF',
    blocks: [],
    ...overrides,
  };
}

function makeOpening(overrides: Partial<ScheduleOpening> = {}): ScheduleOpening {
  return {
    id: 'opening-1',
    date: '2026-08-17',
    startTime: '02:00',
    endTime: '04:00',
    notes: null,
    resourceId: null,
    ...overrides,
  };
}

const baseInput = {
  selectedDateKey: '2026-08-17',
  timezone: 'America/Sao_Paulo',
  slotGranularityMinutes: 30,
  businessHours: makeBusinessHours(),
  placeholderBookingLabel: 'Ocupado',
  selectedStatusSet: new Set([BOOKING_STATUS.APPROVED]),
};

describe('buildResourceColumns', () => {
  it('scopes a resource column to only the bookings the day-grid response assigns to it', () => {
    const camilaBooking = makeBooking({ bookingId: 'booking-camila' });
    const brunoBooking = makeBooking({ bookingId: 'booking-bruno', contactName: 'Outro Cliente' });

    const columns = buildResourceColumns({
      ...baseInput,
      selectedResourceIds: new Set(['res-camila']),
      resourceNameById: new Map([['res-camila', 'Camila Duarte']]),
      dayGridColumns: [
        makeDayGridColumn({
          resourceId: 'res-camila',
          blocks: [
            {
              startsAt: '2026-08-17T12:00:00.000Z',
              endsAt: '2026-08-17T12:30:00.000Z',
              kind: 'BOOKING',
              refId: 'booking-camila',
            },
          ],
        }),
        makeDayGridColumn({
          resourceId: 'res-bruno',
          name: 'Bruno Alves',
          blocks: [
            {
              startsAt: '2026-08-17T14:00:00.000Z',
              endsAt: '2026-08-17T14:30:00.000Z',
              kind: 'BOOKING',
              refId: 'booking-bruno',
            },
          ],
        }),
      ],
      bookings: [camilaBooking, brunoBooking],
      closures: [],
      openings: [],
    });

    expect(columns).toHaveLength(1);
    const bookingIds = columns[0].timeline.events
      .filter((event) => event.kind === 'booking')
      .map((event) => (event.kind === 'booking' ? event.booking.bookingId : null));
    expect(bookingIds).toEqual(['booking-camila']);
  });

  it("renders every checked resource's column, even one with zero day-grid blocks", () => {
    const columns = buildResourceColumns({
      ...baseInput,
      selectedResourceIds: new Set(['res-camila', 'res-bruno']),
      resourceNameById: new Map([
        ['res-camila', 'Camila Duarte'],
        ['res-bruno', 'Bruno Alves'],
      ]),
      dayGridColumns: [makeDayGridColumn({ resourceId: 'res-camila' })],
      bookings: [],
      closures: [],
      openings: [],
    });

    expect(columns.map((c) => c.resourceId)).toEqual(['res-bruno', 'res-camila']);
  });

  it('orders columns alphabetically by resource name regardless of selection-set order', () => {
    const columns = buildResourceColumns({
      ...baseInput,
      selectedResourceIds: new Set(['res-z', 'res-a']),
      resourceNameById: new Map([
        ['res-z', 'Zeca'],
        ['res-a', 'Ana'],
      ]),
      dayGridColumns: [],
      bookings: [],
      closures: [],
      openings: [],
    });

    expect(columns.map((c) => c.resourceName)).toEqual(['Ana', 'Zeca']);
  });

  it("includes a tenant-wide closure (resourceId null) inside every checked resource's column", () => {
    const tenantWideClosure = makeClosure({ resourceId: null });

    const columns = buildResourceColumns({
      ...baseInput,
      selectedResourceIds: new Set(['res-camila', 'res-bruno']),
      resourceNameById: new Map([
        ['res-camila', 'Camila Duarte'],
        ['res-bruno', 'Bruno Alves'],
      ]),
      dayGridColumns: [],
      bookings: [],
      closures: [tenantWideClosure],
      openings: [],
    });

    for (const column of columns) {
      const closureIds = column.timeline.events
        .filter((event) => event.kind === 'closure')
        .map((event) => (event.kind === 'closure' ? event.closure.id : null));
      expect(closureIds).toEqual(['closure-1']);
    }
  });

  it("scopes a resource-specific closure to only that resource's column", () => {
    const camilaClosure = makeClosure({ id: 'closure-camila', resourceId: 'res-camila' });

    const columns = buildResourceColumns({
      ...baseInput,
      selectedResourceIds: new Set(['res-camila', 'res-bruno']),
      resourceNameById: new Map([
        ['res-camila', 'Camila Duarte'],
        ['res-bruno', 'Bruno Alves'],
      ]),
      dayGridColumns: [],
      bookings: [],
      closures: [camilaClosure],
      openings: [],
    });

    const camilaColumn = columns.find((c) => c.resourceId === 'res-camila')!;
    const brunoColumn = columns.find((c) => c.resourceId === 'res-bruno')!;
    expect(camilaColumn.timeline.events.some((e) => e.kind === 'closure')).toBe(true);
    expect(brunoColumn.timeline.events.some((e) => e.kind === 'closure')).toBe(false);
  });

  it('falls back to a placeholder booking when a BOOKING block has no matching local booking', () => {
    const columns = buildResourceColumns({
      ...baseInput,
      selectedResourceIds: new Set(['res-camila']),
      resourceNameById: new Map([['res-camila', 'Camila Duarte']]),
      dayGridColumns: [
        makeDayGridColumn({
          resourceId: 'res-camila',
          blocks: [
            {
              startsAt: '2026-08-17T12:00:00.000Z',
              endsAt: '2026-08-17T12:30:00.000Z',
              kind: 'BOOKING',
              refId: 'booking-missing',
            },
          ],
        }),
      ],
      bookings: [], // the referenced booking isn't in the local list
      closures: [],
      openings: [],
    });

    const bookingEvent = columns[0].timeline.events.find((e) => e.kind === 'booking');
    expect(
      bookingEvent && bookingEvent.kind === 'booking' ? bookingEvent.booking.contactName : null,
    ).toBe('Ocupado');
  });

  it('excludes a matched booking whose status is filtered out, rather than showing it as a placeholder', () => {
    const pendingBooking = makeBooking({
      bookingId: 'booking-pending',
      status: BOOKING_STATUS.PENDING,
    });

    const columns = buildResourceColumns({
      ...baseInput,
      selectedStatusSet: new Set([BOOKING_STATUS.APPROVED]), // PENDING unchecked, matches the default
      selectedResourceIds: new Set(['res-camila']),
      resourceNameById: new Map([['res-camila', 'Camila Duarte']]),
      dayGridColumns: [
        makeDayGridColumn({
          resourceId: 'res-camila',
          blocks: [
            {
              startsAt: '2026-08-17T12:00:00.000Z',
              endsAt: '2026-08-17T12:30:00.000Z',
              kind: 'BOOKING',
              refId: 'booking-pending',
            },
          ],
        }),
      ],
      bookings: [pendingBooking], // present in the full list — day-grid always includes REQUESTED
      closures: [],
      openings: [],
    });

    // Not the placeholder either — a real, filtered-out match is hidden outright, never
    // shown as "Ocupado" (that fallback is reserved for a refId with no match at all).
    expect(columns[0].timeline.events.filter((e) => e.kind === 'booking')).toHaveLength(0);
  });

  it('includes a matched booking once its status is checked', () => {
    const pendingBooking = makeBooking({
      bookingId: 'booking-pending',
      status: BOOKING_STATUS.PENDING,
    });

    const columns = buildResourceColumns({
      ...baseInput,
      selectedStatusSet: new Set([BOOKING_STATUS.APPROVED, BOOKING_STATUS.PENDING]),
      selectedResourceIds: new Set(['res-camila']),
      resourceNameById: new Map([['res-camila', 'Camila Duarte']]),
      dayGridColumns: [
        makeDayGridColumn({
          resourceId: 'res-camila',
          blocks: [
            {
              startsAt: '2026-08-17T12:00:00.000Z',
              endsAt: '2026-08-17T12:30:00.000Z',
              kind: 'BOOKING',
              refId: 'booking-pending',
            },
          ],
        }),
      ],
      bookings: [pendingBooking],
      closures: [],
      openings: [],
    });

    const bookingEvent = columns[0].timeline.events.find((e) => e.kind === 'booking');
    expect(
      bookingEvent && bookingEvent.kind === 'booking' ? bookingEvent.booking.bookingId : null,
    ).toBe('booking-pending');
  });

  it('ignores CLASS_SESSION blocks (unreachable before M24)', () => {
    const columns = buildResourceColumns({
      ...baseInput,
      selectedResourceIds: new Set(['res-estudio']),
      resourceNameById: new Map([['res-estudio', 'Estúdio 1']]),
      dayGridColumns: [
        makeDayGridColumn({
          resourceId: 'res-estudio',
          name: 'Estúdio 1',
          type: 'ROOM',
          blocks: [
            {
              startsAt: '2026-08-17T12:00:00.000Z',
              endsAt: '2026-08-17T12:30:00.000Z',
              kind: 'CLASS_SESSION',
              refId: 'session-1',
            },
          ],
        }),
      ],
      bookings: [],
      closures: [],
      openings: [],
    });

    expect(columns[0].timeline.events).toHaveLength(0);
  });

  it('uses the plain grid coordinate unit, not a content-fit floor (TD44 Story 4 — decoupled)', () => {
    const columns = buildResourceColumns({
      ...baseInput,
      selectedResourceIds: new Set(['res-camila']),
      resourceNameById: new Map([['res-camila', 'Camila Duarte']]),
      dayGridColumns: [makeDayGridColumn({ resourceId: 'res-camila' })],
      bookings: [],
      closures: [],
      openings: [],
    });

    // 30-min granularity at the default scale (1) -> 72px (TD44 Story 5 — base raised from 48);
    // the content-fit floor (DESKTOP_MIN_BLOCK_HEIGHT_PX) is applied per block now, not fed into
    // this grid unit.
    expect(columns[0].timeline.slotHeight).toBe(72);
  });

  describe('shared hour axis (TD44 Story 3)', () => {
    it('gives two checked resources on the same regular hours an identical shared window, with only the first rendering its own label column', () => {
      const columns = buildResourceColumns({
        ...baseInput,
        selectedResourceIds: new Set(['res-camila', 'res-bruno']),
        resourceNameById: new Map([
          ['res-camila', 'Camila Duarte'],
          ['res-bruno', 'Bruno Alves'],
        ]),
        dayGridColumns: [],
        bookings: [],
        closures: [],
        openings: [],
      });

      // Alphabetical order: Bruno Alves, Camila Duarte.
      expect(columns.map((c) => c.resourceName)).toEqual(['Bruno Alves', 'Camila Duarte']);
      expect(columns[0].timeline.timelineStartMinutes).toBe(540);
      expect(columns[0].timeline.timelineEndMinutes).toBe(1080);
      expect(columns[1].timeline.timelineStartMinutes).toBe(540);
      expect(columns[1].timeline.timelineEndMinutes).toBe(1080);
      expect(columns[0].rendersOwnLabelColumn).toBe(true);
      expect(columns[1].rendersOwnLabelColumn).toBe(false);
    });

    it('keeps a resource with an exceptional opening on its own independent window, opted out of the shared axis', () => {
      // Camila has a wildly-outside-normal-hours exceptional opening (2am-4am); Bruno stays on
      // regular hours (09:00-18:00, from makeBusinessHours()).
      const camilaOpening = makeOpening({ resourceId: 'res-camila' });

      const columns = buildResourceColumns({
        ...baseInput,
        selectedResourceIds: new Set(['res-camila', 'res-bruno']),
        resourceNameById: new Map([
          ['res-camila', 'Camila Duarte'],
          ['res-bruno', 'Bruno Alves'],
        ]),
        dayGridColumns: [],
        bookings: [],
        closures: [],
        openings: [camilaOpening],
      });

      const camilaColumn = columns.find((c) => c.resourceId === 'res-camila')!;
      const brunoColumn = columns.find((c) => c.resourceId === 'res-bruno')!;

      // Camila's own 2am-4am window must not stretch Bruno's shared range, and vice versa.
      expect(camilaColumn.timeline.timelineStartMinutes).toBe(120);
      expect(camilaColumn.timeline.timelineEndMinutes).toBe(240);
      expect(camilaColumn.rendersOwnLabelColumn).toBe(true);

      expect(brunoColumn.timeline.timelineStartMinutes).toBe(540);
      expect(brunoColumn.timeline.timelineEndMinutes).toBe(1080);
      expect(brunoColumn.rendersOwnLabelColumn).toBe(true);
    });

    it('collapses to the single column look for exactly one checked resource (non-regression)', () => {
      const columns = buildResourceColumns({
        ...baseInput,
        selectedResourceIds: new Set(['res-camila']),
        resourceNameById: new Map([['res-camila', 'Camila Duarte']]),
        dayGridColumns: [],
        bookings: [],
        closures: [],
        openings: [],
      });

      expect(columns[0].rendersOwnLabelColumn).toBe(true);
      expect(columns[0].timeline.timelineStartMinutes).toBe(540);
      expect(columns[0].timeline.timelineEndMinutes).toBe(1080);
    });
  });

  describe('spillover occupancy (TD43)', () => {
    // Booking's own service is 2026-08-17 23:50 local (America/Sao_Paulo, UTC-3) for 10 minutes,
    // but a 30-minute buffer/turnover pushes the day-grid block's own endsAt to 2026-08-18 00:30
    // local — the resource is genuinely occupied on the *next* calendar day, even though the
    // booking's own scheduledAt/getBookingDateKey still resolves to 2026-08-17.
    const spilloverBooking = makeBooking({
      bookingId: 'booking-spillover',
      scheduledAt: '2026-08-18T02:50:00.000Z', // 2026-08-17T23:50 local
    });
    const spilloverBlock = {
      startsAt: '2026-08-18T02:50:00.000Z',
      endsAt: '2026-08-18T03:30:00.000Z', // 2026-08-18T00:30 local
      kind: 'BOOKING' as const,
      refId: 'booking-spillover',
    };

    it("routes a booking whose own day differs from the column's day into spilloverOccupancy, not the grid", () => {
      const columns = buildResourceColumns({
        ...baseInput,
        selectedDateKey: '2026-08-18',
        selectedResourceIds: new Set(['res-camila']),
        resourceNameById: new Map([['res-camila', 'Camila Duarte']]),
        dayGridColumns: [makeDayGridColumn({ resourceId: 'res-camila', blocks: [spilloverBlock] })],
        bookings: [spilloverBooking],
        closures: [],
        openings: [],
      });

      expect(columns[0].spilloverOccupancy).toEqual([
        { bookingId: 'booking-spillover', contactName: 'João Silva', endsAtLocalTime: '00:30' },
      ]);
      expect(columns[0].timeline.events.filter((e) => e.kind === 'booking')).toHaveLength(0);
    });

    it('produces no spillover entry when the matched booking is filtered out by status', () => {
      const columns = buildResourceColumns({
        ...baseInput,
        selectedDateKey: '2026-08-18',
        selectedStatusSet: new Set([BOOKING_STATUS.PENDING]), // spilloverBooking is APPROVED
        selectedResourceIds: new Set(['res-camila']),
        resourceNameById: new Map([['res-camila', 'Camila Duarte']]),
        dayGridColumns: [makeDayGridColumn({ resourceId: 'res-camila', blocks: [spilloverBlock] })],
        bookings: [spilloverBooking],
        closures: [],
        openings: [],
      });

      expect(columns[0].spilloverOccupancy).toEqual([]);
    });

    it('leaves a same-day matched booking unaffected — spilloverOccupancy stays empty (non-regression)', () => {
      const columns = buildResourceColumns({
        ...baseInput,
        selectedResourceIds: new Set(['res-camila']),
        resourceNameById: new Map([['res-camila', 'Camila Duarte']]),
        dayGridColumns: [
          makeDayGridColumn({
            resourceId: 'res-camila',
            blocks: [
              {
                startsAt: '2026-08-17T12:00:00.000Z',
                endsAt: '2026-08-17T12:30:00.000Z',
                kind: 'BOOKING',
                refId: 'booking-1',
              },
            ],
          }),
        ],
        bookings: [makeBooking()],
        closures: [],
        openings: [],
      });

      expect(columns[0].spilloverOccupancy).toEqual([]);
      expect(columns[0].timeline.events.filter((e) => e.kind === 'booking')).toHaveLength(1);
    });
  });
});
