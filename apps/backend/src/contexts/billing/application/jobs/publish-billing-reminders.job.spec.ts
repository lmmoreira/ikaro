import { addDaysUTC } from '../../../../shared/utils/calendar-date';
import { AppLogger } from '../../../../shared/observability/app-logger';
import { SubscriptionBuilder } from '../../../../test/builders/billing';
import {
  createRemindersHarness,
  REMINDERS_NOW,
  REMINDERS_TODAY,
  saoPauloMidnight,
} from '../../../../test/infrastructure/billing-reminders-harness';
import type { Subscription } from '../../domain/subscription.aggregate';

// A page of 2, so paging is reachable with a handful of rows.
jest.mock('../../domain/billing-constants', () => ({
  ...jest.requireActual('../../domain/billing-constants'),
  BILLING_JOB_PAGE_SIZE: 2,
}));

const day = (offset: number): string => addDaysUTC(REMINDERS_TODAY, offset);
const DAY_MS = 24 * 60 * 60 * 1000;

describe('PublishBillingRemindersJob (UC-139)', () => {
  let h: ReturnType<typeof createRemindersHarness>;

  beforeEach(() => {
    h = createRemindersHarness();
    jest.restoreAllMocks();
  });

  const run = () => h.job.run({ correlationId: 'corr-job' });
  const trialEndingIn = (days: number): Subscription =>
    new SubscriptionBuilder()
      .withStatus('TRIALING')
      .withTrialEndsAt(saoPauloMidnight(day(days)))
      .build();
  const active = (): Subscription => new SubscriptionBuilder().withStatus('ACTIVE').build();

  it('publishes the reminders of a trial and of a charge in one run, each once per milestone', async () => {
    const trial = trialEndingIn(7);
    await h.seedTenant(trial);
    const renewing = active();
    await h.seedTenant(renewing);
    await h.seedCharge(renewing, { dueDate: day(3) });

    const result = await run();

    expect(h.kinds(trial.tenantId)).toEqual(['PLAN_CONFIRMATION:7', 'TRIAL_ENDING:7']);
    expect(h.kinds(renewing.tenantId)).toEqual(['CHARGE_DUE_SOON:3']);
    expect(result).toMatchObject({
      selected: 2,
      published: { PLAN_CONFIRMATION: 1, TRIAL_ENDING: 1, CHARGE_DUE_SOON: 1 },
      skippedFrozen: 0,
      failed: 0,
    });
  });

  it('visits a tenant reached by both selections once', async () => {
    const trial = trialEndingIn(3);
    await h.seedTenant(trial);
    await h.seedCharge(trial, { dueDate: day(3) });

    const result = await run();

    expect(result.selected).toBe(1);
    expect(h.kinds()).toEqual(['TRIAL_ENDING:3']);
  });

  it('selects only the windows: a trial far from its end and a charge far from its due date are not visited', async () => {
    await h.seedTenant(trialEndingIn(20));
    const farCharge = active();
    await h.seedTenant(farCharge);
    await h.seedCharge(farCharge, { dueDate: day(-40), status: 'OVERDUE' });
    const spy = jest.spyOn(h.publishOne, 'execute');

    const result = await run();

    expect(result.selected).toBe(0);
    expect(spy).not.toHaveBeenCalled();
  });

  it('skips an exempt subscription (not even selected) and one with nothing due today (visited, no row)', async () => {
    const exempt = new SubscriptionBuilder()
      .withStatus('TRIALING')
      .withExempt(true)
      .withTrialEndsAt(saoPauloMidnight(day(7)))
      .build();
    await h.seedTenant(exempt);
    const quiet = trialEndingIn(9);
    await h.seedTenant(quiet);

    const result = await run();

    expect(h.commands()).toEqual([]);
    expect(result).toMatchObject({ selected: 1, outcomes: { NONE: 1 } });
  });

  it('pages a selection by keyset: every row beyond the first page is visited', async () => {
    const tenants: Subscription[] = [];
    for (let i = 0; i < 5; i += 1) {
      const subscription = trialEndingIn(7);
      await h.seedTenant(subscription);
      tenants.push(subscription);
    }

    const result = await run();

    expect(result.selected).toBe(5);
    expect(new Set(h.commands().map((c) => c.tenantId))).toEqual(
      new Set(tenants.map((t) => t.tenantId)),
    );
  });

  it('withholds only the day-12 overdue reminder for a frozen provider account', async () => {
    const lateTwelve = new SubscriptionBuilder()
      .withStatus('PAST_DUE')
      .withPastDueSince(new Date(REMINDERS_NOW.getTime() - 12 * DAY_MS))
      .build();
    await h.seedTenant(lateTwelve);
    await h.seedCharge(lateTwelve, { dueDate: day(-12), status: 'OVERDUE' });
    const lateSeven = new SubscriptionBuilder()
      .withStatus('PAST_DUE')
      .withPastDueSince(new Date(REMINDERS_NOW.getTime() - 7 * DAY_MS))
      .build();
    await h.seedTenant(lateSeven);
    await h.seedCharge(lateSeven, { dueDate: day(-7), status: 'OVERDUE' });
    await h.freeze('BRL_FAKE');

    const result = await run();

    expect(h.kinds(lateTwelve.tenantId)).toEqual([]);
    expect(h.kinds(lateSeven.tenantId)).toEqual(['CHARGE_OVERDUE:7']);
    expect(result.skippedFrozen).toBe(1);
  });

  it('fails the run before publishing anything when the freeze rows cannot be read', async () => {
    const trial = trialEndingIn(7);
    await h.seedTenant(trial);
    jest.spyOn(h.health, 'listFrozenKeys').mockRejectedValue(new Error('db down'));

    await expect(run()).rejects.toThrow('db down');

    expect(h.commands()).toEqual([]);
  });

  describe('a failure', () => {
    beforeEach(() => {
      jest.spyOn(AppLogger.prototype, 'error').mockImplementation(() => undefined);
    });

    it('never stops the other subscriptions, is counted, logged once and rethrown after every one was tried', async () => {
      const failing = trialEndingIn(7);
      const healthy = trialEndingIn(7);
      await h.seedTenant(failing);
      await h.seedTenant(healthy);
      const real = h.accounts.findByTenantId.bind(h.accounts);
      jest.spyOn(h.accounts, 'findByTenantId').mockImplementation(async (tenantId) => {
        if (tenantId === failing.tenantId) throw new Error('account read failed');
        return real(tenantId);
      });
      const log = jest.spyOn(AppLogger.prototype, 'log').mockImplementation(() => undefined);

      await expect(run()).rejects.toThrow('1 subscriptions failed to publish reminders');

      expect(h.kinds(healthy.tenantId)).toEqual(['PLAN_CONFIRMATION:7', 'TRIAL_ENDING:7']);
      expect(h.kinds(failing.tenantId)).toEqual([]);
      const runLine = log.mock.calls.find(([message]) => message === 'billing_reminders_run');
      expect(runLine?.[1]).toMatchObject({
        correlationId: 'corr-job',
        selected: 2,
        failed: 1,
        selectionFailed: 0,
      });
    });

    it('keeps going past a selection page that cannot be read, counts it, and still rethrows', async () => {
      const trial = trialEndingIn(7);
      await h.seedTenant(trial);
      jest
        .spyOn(h.subscriptions, 'findTrialEndingForJob')
        .mockRejectedValue(new Error('page down'));
      const renewing = active();
      await h.seedTenant(renewing);
      await h.seedCharge(renewing, { dueDate: day(3) });
      const log = jest.spyOn(AppLogger.prototype, 'log').mockImplementation(() => undefined);

      await expect(run()).rejects.toThrow('page down');

      expect(h.kinds(renewing.tenantId)).toEqual(['CHARGE_DUE_SOON:3']);
      const runLine = log.mock.calls.find(([message]) => message === 'billing_reminders_run');
      expect(runLine?.[1]).toMatchObject({ selectionFailed: 1 });
    });
  });

  it('a skipped cron day loses its milestone for good: the next day does not back-fill it', async () => {
    const trial = trialEndingIn(7);
    await h.seedTenant(trial);
    h.clock.advanceMs(DAY_MS);

    await run();

    // Tomorrow the trial ends in 6 days: neither the 7-day nor any 10-day reminder is produced.
    expect(h.commands()).toEqual([]);
  });

  it('walks one trial day by day on the fake clock and writes the exact sequence', async () => {
    const trial = trialEndingIn(10);
    await h.seedTenant(trial);
    const sequence: string[] = [];

    for (let elapsed = 0; elapsed <= 10; elapsed += 1) {
      await run();
      sequence.push(
        ...h
          .kinds()
          .slice(sequence.length)
          .map((k) => `d${elapsed}:${k}`),
      );
      h.clock.advanceMs(DAY_MS);
    }

    expect(sequence).toEqual([
      'd0:PLAN_CONFIRMATION:10',
      'd3:PLAN_CONFIRMATION:7',
      'd3:TRIAL_ENDING:7',
      'd6:PLAN_CONFIRMATION:4',
      'd7:TRIAL_ENDING:3',
      'd10:TRIAL_ENDING:0',
    ]);
  });

  it('walks one overdue subscription day by day: 1, 3, 7 and 12 days after its due date', async () => {
    const subscription = new SubscriptionBuilder()
      .withStatus('PAST_DUE')
      .withPastDueSince(new Date(REMINDERS_NOW.getTime() - DAY_MS))
      .build();
    await h.seedTenant(subscription);
    await h.seedCharge(subscription, { dueDate: day(-1), status: 'OVERDUE' });
    const seen: string[] = [];

    for (let elapsed = 0; elapsed <= 14; elapsed += 1) {
      await run();
      seen.push(...h.kinds().slice(seen.length));
      h.clock.advanceMs(DAY_MS);
    }

    expect(seen).toEqual([
      'CHARGE_OVERDUE:1',
      'CHARGE_OVERDUE:3',
      'CHARGE_OVERDUE:7',
      'CHARGE_OVERDUE:12',
    ]);
  });
});
