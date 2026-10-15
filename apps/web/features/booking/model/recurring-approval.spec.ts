import { describe, expect, it } from 'vitest';
import type { RecurringBookingScheduleListItem, ResourceRequirementItem } from '@ikaro/types';
import {
  buildResourceRows,
  maxOccurrenceCount,
  sortByDecisionDeadline,
} from './recurring-approval';

function requirement(
  type: ResourceRequirementItem['type'],
  selectionMode: ResourceRequirementItem['selectionMode'],
): ResourceRequirementItem {
  return { type, selectionMode, resourcePoolIds: null, requiredQuantity: 1 };
}

function schedule(
  overrides: Partial<RecurringBookingScheduleListItem> = {},
): RecurringBookingScheduleListItem {
  return {
    id: 's-1',
    customerId: 'c-1',
    serviceId: 'svc-1',
    serviceName: 'Sala Aurora',
    recurrence: {
      frequency: 'WEEKLY',
      daysOfWeek: ['tuesday'],
      startTime: '10:00',
      durationMinutes: 120,
    },
    startsOn: '2026-08-19',
    endsOn: '2026-11-11',
    status: 'PENDING_APPROVAL',
    assignmentPolicy: 'FIXED_ASSIGNMENT',
    approvalHoldExpiresAt: '2026-08-11T12:30:00.000Z',
    ...overrides,
  };
}

describe('maxOccurrenceCount', () => {
  it('counts the Tuesdays between two dates (the prototype\'s "até 13")', () => {
    // 19 Aug 2026 is a Wednesday, so the first Tuesday is 25 Aug and the last is 10 Nov.
    expect(maxOccurrenceCount(schedule())).toBe(12);
  });

  it('counts both ends inclusively', () => {
    // 2026-08-18 is a Tuesday.
    expect(maxOccurrenceCount(schedule({ startsOn: '2026-08-18', endsOn: '2026-08-18' }))).toBe(1);
  });

  it('counts every listed weekday', () => {
    const twice = schedule({
      startsOn: '2026-08-17',
      endsOn: '2026-08-23',
      recurrence: {
        frequency: 'WEEKLY',
        daysOfWeek: ['monday', 'thursday'],
        startTime: '09:00',
        durationMinutes: 60,
      },
    });

    expect(maxOccurrenceCount(twice)).toBe(2);
  });

  it('is zero when no listed weekday falls inside the term', () => {
    expect(maxOccurrenceCount(schedule({ startsOn: '2026-08-19', endsOn: '2026-08-20' }))).toBe(0);
  });
});

describe('sortByDecisionDeadline', () => {
  it('puts the closest deadline first without mutating the input', () => {
    const later = schedule({ id: 'later', approvalHoldExpiresAt: '2026-08-11T13:00:00.000Z' });
    const sooner = schedule({ id: 'sooner', approvalHoldExpiresAt: '2026-08-11T12:00:00.000Z' });
    const input = [later, sooner];

    expect(sortByDecisionDeadline(input).map((s) => s.id)).toEqual(['sooner', 'later']);
    expect(input.map((s) => s.id)).toEqual(['later', 'sooner']);
  });

  it('sorts a request with no deadline last', () => {
    const none = schedule({ id: 'none', approvalHoldExpiresAt: null });
    const some = schedule({ id: 'some' });

    expect(sortByDecisionDeadline([none, some]).map((s) => s.id)).toEqual(['some', 'none']);
  });
});

describe('buildResourceRows', () => {
  it('draws no row for a service whose only requirement is NONE', () => {
    expect(buildResourceRows([requirement('LOCATION', 'NONE')], [])).toEqual([]);
  });

  it('draws the picked resource for a CUSTOMER_CHOICE requirement', () => {
    const rows = buildResourceRows(
      [requirement('ROOM', 'CUSTOMER_CHOICE')],
      [{ resourceType: 'ROOM', resourceId: 'room-1' }],
    );

    expect(rows).toEqual([{ kind: 'picked', type: 'ROOM', resourceId: 'room-1' }]);
  });

  it('draws one row per requirement of a bundle, in the service order', () => {
    const rows = buildResourceRows(
      [
        requirement('ROOM', 'CUSTOMER_CHOICE'),
        requirement('EQUIPMENT', 'CUSTOMER_CHOICE'),
        requirement('STAFF', 'AUTO_ANY'),
      ],
      [
        { resourceType: 'EQUIPMENT', resourceId: 'eq-1' },
        { resourceType: 'ROOM', resourceId: 'room-1' },
      ],
    );

    expect(rows).toEqual([
      { kind: 'picked', type: 'ROOM', resourceId: 'room-1' },
      { kind: 'picked', type: 'EQUIPMENT', resourceId: 'eq-1' },
      { kind: 'automatic', type: 'STAFF' },
    ]);
  });

  it('marks an AUTO_FUNGIBLE_POOL requirement as automatic', () => {
    expect(buildResourceRows([requirement('EQUIPMENT', 'AUTO_FUNGIBLE_POOL')], [])).toEqual([
      { kind: 'automatic', type: 'EQUIPMENT' },
    ]);
  });

  it('gives two requirements of the same type their picks in requirement order', () => {
    const rows = buildResourceRows(
      [requirement('STAFF', 'CUSTOMER_CHOICE'), requirement('STAFF', 'CUSTOMER_CHOICE')],
      [
        { resourceType: 'STAFF', resourceId: 'staff-1' },
        { resourceType: 'STAFF', resourceId: 'staff-2' },
      ],
    );

    expect(rows).toEqual([
      { kind: 'picked', type: 'STAFF', resourceId: 'staff-1' },
      { kind: 'picked', type: 'STAFF', resourceId: 'staff-2' },
    ]);
  });

  it('falls back to automatic when a CUSTOMER_CHOICE requirement has no stored pick', () => {
    expect(buildResourceRows([requirement('ROOM', 'CUSTOMER_CHOICE')], [])).toEqual([
      { kind: 'automatic', type: 'ROOM' },
    ]);
  });
});
