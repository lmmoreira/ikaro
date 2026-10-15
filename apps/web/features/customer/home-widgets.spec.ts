import { describe, expect, it } from 'vitest';
import type { RecurringBookingScheduleListItem } from '@ikaro/types';
import { selectRenewalCandidate } from './home-widgets';

function makeSchedule(
  overrides: Partial<RecurringBookingScheduleListItem> = {},
): RecurringBookingScheduleListItem {
  return {
    id: 'sched-1',
    customerId: 'c1',
    serviceId: 's1',
    serviceName: 'Sala Horizonte',
    recurrence: {
      frequency: 'WEEKLY',
      daysOfWeek: ['friday'],
      startTime: '16:00',
      durationMinutes: 120,
    },
    startsOn: '2026-06-01',
    endsOn: '2026-08-29',
    status: 'ACTIVE',
    assignmentPolicy: 'FIXED_ASSIGNMENT',
    approvalHoldExpiresAt: null,
    renewable: true,
    ...overrides,
  };
}

describe('selectRenewalCandidate', () => {
  it('returns nothing for an empty list', () => {
    expect(selectRenewalCandidate([], '2026-08-22')).toBeNull();
  });

  it('returns nothing when no running schedule is flagged renewable', () => {
    const schedules = [
      makeSchedule({ id: 'no', renewable: false }),
      makeSchedule({ id: 'missing', renewable: undefined }),
    ];

    expect(selectRenewalCandidate(schedules, '2026-08-22')).toBeNull();
  });

  it('ignores a renewable flag on a schedule that is not running', () => {
    const schedules = [
      makeSchedule({ id: 'ended', status: 'ENDED', renewable: true }),
      makeSchedule({ id: 'pending', status: 'PENDING_APPROVAL', renewable: true }),
    ];

    expect(selectRenewalCandidate(schedules, '2026-08-22')).toBeNull();
  });

  it('returns the single renewable schedule with the days left until it ends', () => {
    const only = makeSchedule({ id: 'only', endsOn: '2026-08-29' });
    const selection = selectRenewalCandidate(
      [makeSchedule({ id: 'later', renewable: false, endsOn: '2026-12-01' }), only],
      '2026-08-22',
    );

    expect(selection).toEqual({ kind: 'one', schedule: only, daysLeft: 7 });
  });

  it.each([
    ['2026-08-29', 0],
    ['2026-08-28', 1],
    ['2026-08-22', 7],
  ])('counts the days from %s to the end date', (today, daysLeft) => {
    const selection = selectRenewalCandidate([makeSchedule({ endsOn: '2026-08-29' })], today);

    expect(selection).toMatchObject({ kind: 'one', daysLeft });
  });

  it('counts across a month boundary by calendar day', () => {
    const selection = selectRenewalCandidate(
      [makeSchedule({ endsOn: '2026-09-02' })],
      '2026-08-30',
    );

    expect(selection).toMatchObject({ kind: 'one', daysLeft: 3 });
  });

  it('never reports negative days when the end date is already behind today', () => {
    const selection = selectRenewalCandidate(
      [makeSchedule({ endsOn: '2026-08-20' })],
      '2026-08-22',
    );

    expect(selection).toMatchObject({ kind: 'one', daysLeft: 0 });
  });

  it('reports how many are ending, and the days left for the first, when several are', () => {
    const selection = selectRenewalCandidate(
      [
        makeSchedule({ id: 'b', endsOn: '2026-08-29' }),
        makeSchedule({ id: 'a', endsOn: '2026-08-25' }),
        makeSchedule({ id: 'c', renewable: false, endsOn: '2026-08-23' }),
      ],
      '2026-08-22',
    );

    expect(selection).toEqual({ kind: 'many', count: 2, firstDaysLeft: 3 });
  });
});
