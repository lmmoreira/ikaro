import { describe, expect, it } from 'vitest';
import type { ScheduleOpening, TenantBusinessHours } from '@ikaro/types';
import {
  buildOpeningTimelineEvents,
  findTenantWideOpening,
  resolveActiveTimelineHours,
} from './schedule-timeline-window';

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

function makeOpening(overrides: Partial<ScheduleOpening> = {}): ScheduleOpening {
  return {
    id: 'opening-1',
    date: '2026-08-18',
    startTime: '09:00',
    endTime: '18:00',
    notes: null,
    resourceId: null,
    ...overrides,
  };
}

describe('findTenantWideOpening', () => {
  it('picks the tenant-wide (resourceId null) opening among several for the same date', () => {
    const tenantWide = makeOpening({ id: 'tenant', resourceId: null });
    const resourceScoped = makeOpening({ id: 'resource', resourceId: 'res-1' });
    expect(findTenantWideOpening([resourceScoped, tenantWide])).toBe(tenantWide);
  });

  it('returns null when only resource-scoped openings exist', () => {
    const resourceScoped = makeOpening({ id: 'resource', resourceId: 'res-1' });
    expect(findTenantWideOpening([resourceScoped])).toBeNull();
  });
});

describe('resolveActiveTimelineHours', () => {
  it('collects every opening for the selected date, not just the first', () => {
    const tenantWide = makeOpening({ id: 'tenant', date: '2026-08-18', resourceId: null });
    const resourceScoped = makeOpening({
      id: 'resource',
      date: '2026-08-18',
      startTime: '10:00',
      endTime: '14:00',
      resourceId: 'res-1',
    });
    const otherDate = makeOpening({ id: 'other-date', date: '2026-08-19', resourceId: null });

    const result = resolveActiveTimelineHours(
      '2026-08-18',
      makeBusinessHours(),
      [],
      [tenantWide, resourceScoped, otherDate],
    );

    expect(result?.dayOpenings.map((o) => o.id).sort()).toEqual(['resource', 'tenant']);
  });

  it('uses the tenant-wide opening to determine the active window, not whichever came first', () => {
    const resourceScoped = makeOpening({
      id: 'resource',
      date: '2026-08-18',
      startTime: '10:00',
      endTime: '14:00',
      resourceId: 'res-1',
    });
    const tenantWide = makeOpening({
      id: 'tenant',
      date: '2026-08-18',
      startTime: '09:00',
      endTime: '18:00',
      resourceId: null,
    });

    // Resource-scoped opening listed first in the array — must not win the window.
    const result = resolveActiveTimelineHours(
      '2026-08-18',
      makeBusinessHours(),
      [],
      [resourceScoped, tenantWide],
    );

    expect(result?.activeStartTime).toBe('09:00');
    expect(result?.activeEndTime).toBe('18:00');
  });

  it('falls back to the widest span across resource-scoped openings when no tenant-wide sibling exists', () => {
    const a = makeOpening({
      id: 'a',
      date: '2026-08-18',
      startTime: '11:00',
      endTime: '13:00',
      resourceId: 'res-1',
    });
    const b = makeOpening({
      id: 'b',
      date: '2026-08-18',
      startTime: '09:00',
      endTime: '12:00',
      resourceId: 'res-2',
    });

    const result = resolveActiveTimelineHours('2026-08-18', makeBusinessHours(), [], [a, b]);

    expect(result?.activeStartTime).toBe('09:00');
    expect(result?.activeEndTime).toBe('13:00');
  });
});

describe('buildOpeningTimelineEvents', () => {
  it('renders one event per opening, not just the first', () => {
    const tenantWide = makeOpening({ id: 'tenant', resourceId: null });
    const resourceA = makeOpening({
      id: 'resource-a',
      startTime: '10:00',
      endTime: '12:00',
      resourceId: 'res-1',
    });
    const resourceB = makeOpening({
      id: 'resource-b',
      startTime: '14:00',
      endTime: '16:00',
      resourceId: 'res-2',
    });

    const events = buildOpeningTimelineEvents([tenantWide, resourceA, resourceB], new Map());

    expect(events.map((e) => e.id).sort()).toEqual(['resource-a', 'resource-b', 'tenant']);
  });

  it('keeps the tenant-wide opening full-width and lane-splits overlapping resource-scoped ones', () => {
    const tenantWide = makeOpening({ id: 'tenant', resourceId: null });
    const resourceA = makeOpening({
      id: 'resource-a',
      startTime: '10:00',
      endTime: '12:00',
      resourceId: 'res-1',
    });
    const resourceB = makeOpening({
      id: 'resource-b',
      startTime: '10:00',
      endTime: '12:00',
      resourceId: 'res-2',
    });

    const events = buildOpeningTimelineEvents([tenantWide, resourceA, resourceB], new Map());

    const tenantEvent = events.find((e) => e.id === 'tenant');
    expect(tenantEvent?.laneCount).toBe(1);

    const resourceEvents = events.filter((e) => e.id !== 'tenant');
    expect(resourceEvents.every((e) => e.laneCount === 2)).toBe(true);
    expect(new Set(resourceEvents.map((e) => e.laneIndex))).toEqual(new Set([0, 1]));
  });

  it('resolves resourceName for each resource-scoped opening', () => {
    const resourceA = makeOpening({ id: 'resource-a', resourceId: 'res-1' });
    const events = buildOpeningTimelineEvents([resourceA], new Map([['res-1', 'Leonardo']]));
    expect(events[0].resourceName).toBe('Leonardo');
  });

  it('returns an empty array when there are no openings', () => {
    expect(buildOpeningTimelineEvents([], new Map())).toEqual([]);
  });
});
