import { addDaysUTC } from '../../../shared/utils/calendar-date';
import {
  CHARGE_WINDOW_AHEAD_DAYS,
  CHARGE_WINDOW_BEHIND_DAYS,
  type ReminderCharge,
  type ReminderSubscription,
  remindersDueToday,
  TRIAL_WINDOW_AHEAD_DAYS,
  TRIAL_WINDOW_BEHIND_DAYS,
} from './reminder-schedule';

const TODAY = '2026-12-10';

const trialing = (over: Partial<ReminderSubscription> = {}): ReminderSubscription => ({
  status: 'TRIALING',
  suspensionReason: null,
  exempt: false,
  planConfirmed: false,
  trialEndsOn: null,
  ...over,
});

const charge = (dueDate: string, over: Partial<ReminderCharge> = {}): ReminderCharge => ({
  id: 'charge-1',
  kind: 'PERIOD',
  dueDate,
  ...over,
});

const kindsOf = (input: Parameters<typeof remindersDueToday>[0]): string[] =>
  remindersDueToday(input).map((m) => `${m.kind}:${m.daysOffset}`);

describe('remindersDueToday', () => {
  describe('trial reminders', () => {
    it.each([
      [10, ['PLAN_CONFIRMATION:10']],
      [9, []],
      [7, ['PLAN_CONFIRMATION:7', 'TRIAL_ENDING:7']],
      [4, ['PLAN_CONFIRMATION:4']],
      [3, ['TRIAL_ENDING:3']],
      [1, []],
      [0, ['TRIAL_ENDING:0']],
      [-1, []],
    ])('a trial ending in %i days gets %j', (daysToEnd, expected) => {
      expect(
        kindsOf({
          localToday: TODAY,
          subscription: trialing({ trialEndsOn: addDaysUTC(TODAY, daysToEnd) }),
          charges: [],
        }),
      ).toEqual(expected);
    });

    it('sends no PLAN_CONFIRMATION once the plan is confirmed', () => {
      expect(
        kindsOf({
          localToday: TODAY,
          subscription: trialing({ trialEndsOn: addDaysUTC(TODAY, 7), planConfirmed: true }),
          charges: [],
        }),
      ).toEqual(['TRIAL_ENDING:7']);
    });

    it('carries no charge id on a trial reminder, even with the first invoice open', () => {
      const milestones = remindersDueToday({
        localToday: TODAY,
        subscription: trialing({ trialEndsOn: addDaysUTC(TODAY, 3) }),
        charges: [charge(addDaysUTC(TODAY, 3))],
      });

      expect(milestones).toEqual([{ kind: 'TRIAL_ENDING', daysOffset: 3, chargeId: null }]);
    });

    it('sends nothing for a non-trial subscription that still has a trial end date', () => {
      expect(
        kindsOf({
          localToday: TODAY,
          subscription: trialing({ status: 'ACTIVE', trialEndsOn: addDaysUTC(TODAY, 7) }),
          charges: [],
        }),
      ).toEqual([]);
    });
  });

  describe('CHARGE_DUE_SOON', () => {
    const active = trialing({ status: 'ACTIVE' });

    it.each([
      [4, []],
      [3, ['CHARGE_DUE_SOON:3']],
      [2, []],
    ])('a renewal charge due in %i days gets %j', (daysToDue, expected) => {
      expect(
        kindsOf({
          localToday: TODAY,
          subscription: active,
          charges: [charge(addDaysUTC(TODAY, daysToDue))],
        }),
      ).toEqual(expected);
    });

    it('is not produced for the first trial charge (TRIAL_ENDING covers it)', () => {
      expect(
        kindsOf({
          localToday: TODAY,
          subscription: trialing({ trialEndsOn: addDaysUTC(TODAY, 3) }),
          charges: [charge(addDaysUTC(TODAY, 3))],
        }),
      ).toEqual(['TRIAL_ENDING:3']);
    });

    it('is not produced for a RECOVERY charge', () => {
      expect(
        kindsOf({
          localToday: TODAY,
          subscription: trialing({ status: 'SUSPENDED', suspensionReason: 'NON_PAYMENT' }),
          charges: [charge(addDaysUTC(TODAY, 3), { kind: 'RECOVERY' })],
        }),
      ).toEqual([]);
    });
  });

  describe('CHARGE_OVERDUE', () => {
    const pastDue = trialing({ status: 'PAST_DUE' });

    it.each([
      [0, []],
      [1, ['CHARGE_OVERDUE:1']],
      [2, []],
      [3, ['CHARGE_OVERDUE:3']],
      [7, ['CHARGE_OVERDUE:7']],
      [12, ['CHARGE_OVERDUE:12']],
      [13, []],
    ])('a PAST_DUE charge %i days after its due date gets %j', (daysLate, expected) => {
      expect(
        kindsOf({
          localToday: TODAY,
          subscription: pastDue,
          charges: [charge(addDaysUTC(TODAY, -daysLate))],
        }),
      ).toEqual(expected);
    });

    it('sends nothing when the subscription is not PAST_DUE', () => {
      expect(
        kindsOf({
          localToday: TODAY,
          subscription: trialing({ status: 'ACTIVE' }),
          charges: [charge(addDaysUTC(TODAY, -3))],
        }),
      ).toEqual([]);
    });
  });

  describe('RECOVERY_CHARGE_OPEN', () => {
    const suspended = (reason: ReminderSubscription['suspensionReason']): ReminderSubscription =>
      trialing({ status: 'SUSPENDED', suspensionReason: reason });

    // The recovery charge is due 7 days after it is issued: 3, 8 and 14 days since issue are 4 days
    // before its due date and 1 and 7 days after it.
    it.each([
      [4, ['RECOVERY_CHARGE_OPEN:3']],
      [3, []],
      [0, []],
      [-1, ['RECOVERY_CHARGE_OPEN:8']],
      [-7, ['RECOVERY_CHARGE_OPEN:14']],
      [-8, []],
    ])('an open recovery charge due in %i days gets %j', (daysToDue, expected) => {
      expect(
        kindsOf({
          localToday: TODAY,
          subscription: suspended('NON_PAYMENT'),
          charges: [charge(addDaysUTC(TODAY, daysToDue), { kind: 'RECOVERY' })],
        }),
      ).toEqual(expected);
    });

    it.each([
      ['NON_PAYMENT', 1],
      ['PAYMENT_REVERSED', 1],
      ['CANCELED', 0],
      ['OPERATOR', 0],
    ] as const)('a %s suspension gets %i reminder(s)', (reason, count) => {
      expect(
        remindersDueToday({
          localToday: TODAY,
          subscription: suspended(reason),
          charges: [charge(addDaysUTC(TODAY, 4), { kind: 'RECOVERY' })],
        }),
      ).toHaveLength(count);
    });

    it('carries the recovery charge id', () => {
      expect(
        remindersDueToday({
          localToday: TODAY,
          subscription: suspended('NON_PAYMENT'),
          charges: [charge(addDaysUTC(TODAY, 4), { kind: 'RECOVERY', id: 'recovery-1' })],
        }),
      ).toEqual([{ kind: 'RECOVERY_CHARGE_OPEN', daysOffset: 3, chargeId: 'recovery-1' }]);
    });
  });

  it('gives an exempt subscription nothing, whatever its dates', () => {
    expect(
      kindsOf({
        localToday: TODAY,
        subscription: trialing({ exempt: true, trialEndsOn: addDaysUTC(TODAY, 7) }),
        charges: [charge(addDaysUTC(TODAY, 3))],
      }),
    ).toEqual([]);
  });

  it('does not back-fill a milestone a skipped cron day lost', () => {
    const subscription = trialing({ trialEndsOn: addDaysUTC(TODAY, 7) });
    // The 10-day milestone was yesterday's: today only the 7-day ones exist.
    expect(kindsOf({ localToday: TODAY, subscription, charges: [] })).toEqual([
      'PLAN_CONFIRMATION:7',
      'TRIAL_ENDING:7',
    ]);
  });

  it('matches a month boundary and a leap day by calendar date, not by 30-day months', () => {
    expect(
      kindsOf({
        localToday: '2028-02-26',
        subscription: trialing({ trialEndsOn: '2028-03-07' }),
        charges: [],
      }),
    ).toEqual(['PLAN_CONFIRMATION:10']);
  });

  describe('selection windows', () => {
    it('cover every milestone the rules can produce, plus a day for the time zone', () => {
      expect(TRIAL_WINDOW_AHEAD_DAYS).toBe(11);
      expect(TRIAL_WINDOW_BEHIND_DAYS).toBe(2);
      // Due soon is due in 3 days, a recovery charge's first reminder 4 days before its due date;
      // the last overdue reminder is 12 days after, and the last recovery one 7 days after.
      expect(CHARGE_WINDOW_AHEAD_DAYS).toBe(5);
      expect(CHARGE_WINDOW_BEHIND_DAYS).toBe(13);
    });
  });
});
