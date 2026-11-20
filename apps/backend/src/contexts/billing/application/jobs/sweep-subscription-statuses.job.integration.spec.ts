import { addDaysUTC, todayUTC } from '../../../../shared/utils/calendar-date';
import { uuidv7 } from '../../../../shared/domain/uuid-v7';
import { createSweepWorld, type SweepWorld } from '../../../../test/utils/billing-sweep-world';

// The job with its real cross-tenant selectors against Postgres. It selects across every tenant in
// the (shared) database, so each assertion looks at this spec's own tenants only; the other suites'
// rows are recent or in the future and never due.
describe('SweepSubscriptionStatusesJob (integration, UC-115)', () => {
  let world: SweepWorld;

  beforeAll(async () => {
    world = await createSweepWorld();
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    await world.cleanup();
  });

  afterAll(async () => {
    await world.destroy();
  });

  const run = () => world.sweep.run({ correlationId: 'corr-run' });
  const statusOf = async (tenantId: string) => {
    const row = await world.subscriptionRow(tenantId);
    return { status: row.status, reason: row.suspensionReason };
  };
  const overdueDate = () => addDaysUTC(todayUTC(), -20);

  it('sweeps what each rule finds, for its own tenant only, and leaves a healthy subscription alone', async () => {
    const overdue = await world.seedSubscription({
      configure: (b) => b.withStatus('ACTIVE').withTrialEndsAt(null),
    });
    await world.seedCharge(overdue, { dueDate: addDaysUTC(todayUTC(), -3) });
    const cancelling = await world.seedSubscription({
      configure: (b) => b.withStatus('ACTIVE').withTrialEndsAt(null).withCancelAt(world.daysAgo(1)),
    });
    const trial = await world.seedSubscription({
      configure: (b) => b.withStatus('TRIALING').withTrialEndsAt(world.daysAgo(2)),
    });
    const grace = await world.seedSubscription({
      configure: (b) =>
        b.withStatus('PAST_DUE').withPastDueSince(world.daysAgo(15)).withTrialEndsAt(null),
    });
    await world.seedCharge(grace, { dueDate: overdueDate(), status: 'OVERDUE' });
    const healthy = await world.seedSubscription({
      configure: (b) => b.withStatus('ACTIVE').withTrialEndsAt(null),
    });

    await run();

    expect(await statusOf(overdue.tenantId)).toEqual({ status: 'PAST_DUE', reason: null });
    expect(await statusOf(cancelling.tenantId)).toEqual({
      status: 'SUSPENDED',
      reason: 'CANCELED',
    });
    expect(await statusOf(trial.tenantId)).toEqual({ status: 'SUSPENDED', reason: 'NON_PAYMENT' });
    expect(await statusOf(grace.tenantId)).toEqual({ status: 'SUSPENDED', reason: 'NON_PAYMENT' });
    expect(await statusOf(healthy.tenantId)).toEqual({ status: 'ACTIVE', reason: null });
    expect(await world.chargeRows(healthy.tenantId)).toEqual([]);
  });

  it('running twice produces one recovery charge', async () => {
    const grace = await world.seedSubscription({
      configure: (b) =>
        b.withStatus('PAST_DUE').withPastDueSince(world.daysAgo(15)).withTrialEndsAt(null),
    });
    await world.seedCharge(grace, { dueDate: overdueDate(), status: 'OVERDUE' });

    await run();
    await run();

    const rows = await world.chargeRows(grace.tenantId);
    expect(rows.filter((row) => row.kind === 'RECOVERY')).toHaveLength(1);
  });

  describe('the suspension freeze, read from provider_health', () => {
    it('holds back only the frozen profile: another profile, and a profile with no row, are suspended', async () => {
      const frozenKey = `TEST_${uuidv7().slice(-12)}`;
      const noRowKey = `TEST_${uuidv7().slice(-12)}`;
      await world.seedHealthKey(frozenKey, new Date());
      const pastDue = (key: string) =>
        world.seedSubscription({
          configure: (b) =>
            b
              .withStatus('PAST_DUE')
              .withPastDueSince(world.daysAgo(30))
              .withTrialEndsAt(null)
              .withMerchantProfileKey(key),
        });
      const frozen = await pastDue(frozenKey);
      const noRow = await pastDue(noRowKey);
      const otherProfile = await pastDue('BRL_FAKE');

      await run();

      expect((await statusOf(frozen.tenantId)).status).toBe('PAST_DUE');
      expect((await statusOf(noRow.tenantId)).status).toBe('SUSPENDED');
      expect((await statusOf(otherProfile.tenantId)).status).toBe('SUSPENDED');
    });

    it('a scheduled cancel still happens under a freeze, while a non-payment suspension does not', async () => {
      const key = `TEST_${uuidv7().slice(-12)}`;
      await world.seedHealthKey(key, new Date());
      const cancelling = await world.seedSubscription({
        configure: (b) =>
          b
            .withStatus('ACTIVE')
            .withTrialEndsAt(null)
            .withCancelAt(world.daysAgo(1))
            .withMerchantProfileKey(key),
      });
      const lapsed = await world.seedSubscription({
        configure: (b) =>
          b
            .withStatus('PAST_DUE')
            .withPastDueSince(world.daysAgo(20))
            .withTrialEndsAt(null)
            .withMerchantProfileKey(key),
      });

      await run();

      expect(await statusOf(cancelling.tenantId)).toEqual({
        status: 'SUSPENDED',
        reason: 'CANCELED',
      });
      expect((await statusOf(lapsed.tenantId)).status).toBe('PAST_DUE');
    });
  });
});
