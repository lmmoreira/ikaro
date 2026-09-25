import { describe, expect, it } from 'vitest';
import type { DayGridColumn, DayGridResponse } from '@ikaro/types';
import {
  buildWeekBookingResourceIds,
  isBookingVisibleForResourceFilter,
} from './schedule-week-resource-bookings';

function makeDayGridColumn(overrides: Partial<DayGridColumn> = {}): DayGridColumn {
  return {
    resourceId: 'res-camila',
    name: 'Camila Duarte',
    type: 'STAFF',
    blocks: [],
    ...overrides,
  };
}

function makeDayGridResponse(date: string, columns: readonly DayGridColumn[]): DayGridResponse {
  return { date, columns: [...columns] };
}

describe('buildWeekBookingResourceIds', () => {
  it('returns an empty map when nothing is checked', () => {
    const responses = [
      makeDayGridResponse('2026-08-17', [
        makeDayGridColumn({
          resourceId: 'res-camila',
          blocks: [{ startsAt: '', endsAt: '', kind: 'BOOKING', refId: 'booking-1' }],
        }),
      ]),
    ];

    expect(buildWeekBookingResourceIds(responses, new Set())).toEqual(new Map());
  });

  it('ignores a column whose resource is not checked, even though the response always includes it', () => {
    const responses = [
      makeDayGridResponse('2026-08-17', [
        makeDayGridColumn({
          resourceId: 'res-unchecked',
          blocks: [{ startsAt: '', endsAt: '', kind: 'BOOKING', refId: 'booking-1' }],
        }),
      ]),
    ];

    expect(buildWeekBookingResourceIds(responses, new Set(['res-camila']))).toEqual(new Map());
  });

  it('maps a booking to the single checked resource it matched', () => {
    const responses = [
      makeDayGridResponse('2026-08-17', [
        makeDayGridColumn({
          resourceId: 'res-camila',
          blocks: [{ startsAt: '', endsAt: '', kind: 'BOOKING', refId: 'booking-1' }],
        }),
      ]),
    ];

    expect(buildWeekBookingResourceIds(responses, new Set(['res-camila']))).toEqual(
      new Map([['booking-1', ['res-camila']]]),
    );
  });

  it('accumulates every checked resource a bundled booking matched, across columns and days', () => {
    const responses = [
      makeDayGridResponse('2026-08-17', [
        makeDayGridColumn({
          resourceId: 'res-camila',
          blocks: [{ startsAt: '', endsAt: '', kind: 'BOOKING', refId: 'booking-1' }],
        }),
        makeDayGridColumn({
          resourceId: 'res-room',
          name: 'Sala 1',
          type: 'ROOM',
          blocks: [{ startsAt: '', endsAt: '', kind: 'BOOKING', refId: 'booking-1' }],
        }),
      ]),
      makeDayGridResponse('2026-08-18', [
        makeDayGridColumn({
          resourceId: 'res-camila',
          blocks: [{ startsAt: '', endsAt: '', kind: 'BOOKING', refId: 'booking-2' }],
        }),
      ]),
    ];

    const result = buildWeekBookingResourceIds(responses, new Set(['res-camila', 'res-room']));

    expect([...(result.get('booking-1') ?? [])].sort()).toEqual(['res-camila', 'res-room']);
    expect(result.get('booking-2')).toEqual(['res-camila']);
  });

  it('ignores CLASS_SESSION blocks (unreachable before M24)', () => {
    const responses = [
      makeDayGridResponse('2026-08-17', [
        makeDayGridColumn({
          resourceId: 'res-camila',
          blocks: [{ startsAt: '', endsAt: '', kind: 'CLASS_SESSION', refId: 'session-1' }],
        }),
      ]),
    ];

    expect(buildWeekBookingResourceIds(responses, new Set(['res-camila']))).toEqual(new Map());
  });
});

describe('isBookingVisibleForResourceFilter', () => {
  it('is always visible when zero resources are checked', () => {
    expect(isBookingVisibleForResourceFilter('booking-1', new Set(), new Map())).toBe(true);
  });

  it('is visible when the lookup found at least one checked resource for it', () => {
    const lookup = new Map([['booking-1', ['Camila Duarte']]]);
    expect(isBookingVisibleForResourceFilter('booking-1', new Set(['res-camila']), lookup)).toBe(
      true,
    );
  });

  it('is hidden when 1+ resources are checked but this booking matched none of them', () => {
    const lookup = new Map([['booking-1', ['Camila Duarte']]]);
    expect(isBookingVisibleForResourceFilter('booking-2', new Set(['res-camila']), lookup)).toBe(
      false,
    );
  });
});
