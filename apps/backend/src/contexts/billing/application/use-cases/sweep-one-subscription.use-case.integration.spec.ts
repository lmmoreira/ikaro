import { addDaysUTC, todayUTC } from '../../../../shared/utils/calendar-date';
import { BillingAccountBuilder } from '../../../../test/builders/billing';
import { AddressBuilder } from '../../../../test/builders/shared';
import {
  createSweepWorld,
  type SweepTenant,
  type SweepWorld,
} from '../../../../test/utils/billing-sweep-world';
import { databaseNow, waitForBlockedLock } from '../../../../test/utils/booking-lock-race-world';

// The real repositories, row locks and transactions against Postgres (docs/LOCK_CATALOG.md B-R1,
// B-C1, the open-recovery unique and the creation lease). The clock is the real one: every instant
// is relative to now, and the seeded BR price list prices HOTSITE STANDARD at R$ 49,00.
describe('SweepOneSubscriptionUseCase (integration, UC-115)', () => {
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

  const sweep = (tenant: SweepTenant) =>
    world.sweepOne.execute({
      tenantId: tenant.tenantId,
      correlationId: 'corr-sweep',
      frozenProfileKeys: new Set(),
    });
  const overdue = () => addDaysUTC(todayUTC(), -20);
  const pastDue = () =>
    world.seedSubscription({
      configure: (b) =>
        b.withStatus('PAST_DUE').withPastDueSince(world.daysAgo(15)).withTrialEndsAt(null),
    });
  const recoveryRows = async (tenant: SweepTenant) =>
    (await world.chargeRows(tenant.tenantId)).filter((row) => row.kind === 'RECOVERY');

  it('B-R1: a sweep that decides to suspend parks behind a payment holding the row, then sees it paid and suspends nobody', async () => {
    const tenant = await pastDue();
    const stale = await world.seedCharge(tenant, { dueDate: overdue(), status: 'OVERDUE' });
    let release!: () => void;
    let signalLocked!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const locked = new Promise<void>((resolve) => (signalLocked = resolve));
    // The payment (the webhook's shape): the subscription row, then the charge row, paid and committed.
    const payment = world.txManager.run(async () => {
      const subscription = await world.subscriptions.findByTenantIdForUpdate(tenant.tenantId);
      const charge = await world.charges.findByIdForUpdate(tenant.tenantId, stale.id);
      if (!subscription || !charge) throw new Error('seeded rows missing');
      charge.markPaid('PIX', new Date(), null, 'corr-webhook', null);
      subscription.markPeriodPaid(
        charge.periodStart!,
        charge.periodEnd!,
        new Date(),
        'corr-webhook',
        null,
      );
      await world.charges.save(charge);
      await world.subscriptions.save(subscription);
      signalLocked();
      await gate;
    });
    await locked;

    const since = await databaseNow(world.ds);
    const sweeping = sweep(tenant);
    try {
      await waitForBlockedLock(world.ds, 'row', since);
    } finally {
      release();
      await payment;
    }

    await expect(sweeping).resolves.toMatchObject({ outcome: 'UNCHANGED', steps: [] });
    expect((await world.subscriptionRow(tenant.tenantId)).status).toBe('ACTIVE');
    const rows = await world.chargeRows(tenant.tenantId);
    expect(rows.map((row) => row.status)).toEqual(['PAID']);
    expect(await recoveryRows(tenant)).toEqual([]);
  });

  it('UQ_billing_charges_open_recovery: two sweeps overlapping on one subscription suspend it once and leave one recovery charge', async () => {
    const tenant = await pastDue();
    await world.seedCharge(tenant, { dueDate: overdue(), status: 'OVERDUE' });

    const results = await Promise.all([sweep(tenant), sweep(tenant)]);

    expect(results.map((r) => r.outcome).sort()).toEqual(['SWEPT', 'UNCHANGED']);
    expect(await recoveryRows(tenant)).toHaveLength(1);
    expect(
      world.outbox.published.filter(
        (e) => e.eventName === 'SubscriptionSuspended' && e.tenantId === tenant.tenantId,
      ),
    ).toHaveLength(1);
  });

  it('creation lease: the post-commit recovery creation racing the creation retry yields one provider charge', async () => {
    const tenant = await pastDue();
    await world.seedCharge(tenant, { dueDate: overdue(), status: 'OVERDUE' });
    // The sweep's creation is held at the provider call, so the lease is provably taken while the
    // retry tries the same charge.
    let release!: () => void;
    let reached!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const atProvider = new Promise<void>((resolve) => (reached = resolve));
    const original = world.provider.createCharge.bind(world.provider);
    const createCharge = jest
      .spyOn(world.provider, 'createCharge')
      .mockImplementation(async (input) => {
        reached();
        await gate;
        return original(input);
      });
    const sweeping = sweep(tenant);
    await atProvider;
    const [recovery] = await recoveryRows(tenant);

    let second: string;
    try {
      second = await world.creation.execute({
        tenantId: tenant.tenantId,
        chargeId: recovery.id,
        correlationId: 'corr-retry',
      });
    } finally {
      release();
    }
    await sweeping;

    expect(second).toBe('NOT_CLAIMED');
    expect(createCharge).toHaveBeenCalledTimes(1);
    expect((await recoveryRows(tenant))[0].providerCreationStatus).toBe('READY');
  });

  it('a provider cancel that fails keeps the suspension, flags the stale charge for reconcile and still makes the recovery payable', async () => {
    const tenant = await pastDue();
    const stale = await world.seedCharge(tenant, { dueDate: overdue(), status: 'OVERDUE' });
    // The first provider call of a grace suspension is the stale charge's cancel.
    world.provider.failNextCall('UNAVAILABLE');

    await sweep(tenant);

    expect((await world.subscriptionRow(tenant.tenantId)).status).toBe('SUSPENDED');
    const rows = await world.chargeRows(tenant.tenantId);
    expect(rows.find((row) => row.id === stale.id)).toMatchObject({
      status: 'CANCELED',
      providerCancelPending: true,
    });
    expect((await recoveryRows(tenant))[0]).toMatchObject({
      status: 'PENDING',
      providerCreationStatus: 'READY',
    });
  });

  it('a refusal because the stale charge was just paid follows the paid path: reactivated, the recovery charge cancelled', async () => {
    const tenant = await pastDue();
    const stale = await world.seedCharge(tenant, { dueDate: overdue(), status: 'OVERDUE' });
    world.provider.simulatePayment(stale.providerChargeId!, 'PIX');

    await sweep(tenant);

    expect((await world.subscriptionRow(tenant.tenantId)).status).toBe('ACTIVE');
    const rows = await world.chargeRows(tenant.tenantId);
    expect(rows.find((row) => row.id === stale.id)?.status).toBe('PAID');
    expect((await recoveryRows(tenant))[0]).toMatchObject({
      status: 'CANCELED',
      providerChargeId: null,
    });
  });

  describe('the trial-end re-read', () => {
    const trial = () =>
      world.seedSubscription({
        configure: (b) => b.withStatus('TRIALING').withTrialEndsAt(world.daysAgo(2)),
      });
    const firstChargeDue = () => addDaysUTC(todayUTC(), -2);

    it('a payment the webhook missed activates the trial instead of suspending it', async () => {
      const tenant = await trial();
      const first = await world.seedCharge(tenant, { dueDate: firstChargeDue() });
      world.provider.simulatePayment(first.providerChargeId!, 'PIX');

      await sweep(tenant);

      const subscription = await world.subscriptionRow(tenant.tenantId);
      expect(subscription.status).toBe('ACTIVE');
      expect(subscription.currentPeriodStart).toEqual(subscription.trialEndsAt);
      expect((await world.chargeRows(tenant.tenantId))[0].status).toBe('PAID');
      expect(await recoveryRows(tenant)).toEqual([]);
    });

    it('an unpaid first charge suspends the trial directly and makes the recovery charge payable', async () => {
      const tenant = await trial();
      const first = await world.seedCharge(tenant, { dueDate: firstChargeDue() });

      await sweep(tenant);

      const subscription = await world.subscriptionRow(tenant.tenantId);
      expect(subscription).toMatchObject({ status: 'SUSPENDED', suspensionReason: 'NON_PAYMENT' });
      expect(world.provider.charges.get(first.providerChargeId!)?.state).toBe('CANCELED');
      expect((await recoveryRows(tenant))[0].providerCreationStatus).toBe('READY');
    });

    it('a provider that cannot be asked leaves the trial untouched', async () => {
      const tenant = await trial();
      await world.seedCharge(tenant, { dueDate: firstChargeDue() });
      world.provider.failNextCall('UNAVAILABLE');

      const result = await sweep(tenant);

      expect(result.deferred).toBe(true);
      expect((await world.subscriptionRow(tenant.tenantId)).status).toBe('TRIALING');
      expect(await recoveryRows(tenant)).toEqual([]);
    });
  });

  it('a tenant with no billing address is suspended and its recovery charge held PENDING; saving the identity lets the retry create it', async () => {
    const tenant = await world.seedSubscription({
      configure: (b) =>
        b.withStatus('PAST_DUE').withPastDueSince(world.daysAgo(15)).withTrialEndsAt(null),
      billable: false,
    });
    await world.seedCharge(tenant, { dueDate: overdue(), status: 'OVERDUE' });

    await sweep(tenant);

    expect((await world.subscriptionRow(tenant.tenantId)).status).toBe('SUSPENDED');
    const [held] = await recoveryRows(tenant);
    expect(held).toMatchObject({
      status: 'PENDING',
      providerCreationStatus: 'PENDING',
      providerChargeId: null,
    });

    // The manager saves the identity (S16): the creation retry makes the charge payable, once.
    const account = await world.accounts.findByTenantId(tenant.tenantId);
    await world.txManager.run(() =>
      world.accounts.save(
        new BillingAccountBuilder()
          .withId(account!.id)
          .withTenantId(tenant.tenantId)
          .withTaxId('11144477735', 'CPF')
          .withAddress(new AddressBuilder().build())
          .build(),
      ),
    );
    await world.retry.execute({ correlationId: 'corr-retry' });

    expect((await recoveryRows(tenant))[0].providerCreationStatus).toBe('READY');
  });

  it('a plan with no price in force fails the sweep and suspends nobody: the transaction rolls back, the tenant keeps its state', async () => {
    // The seeded price list covers BR and US only: no price is in force for this country.
    const tenant = await world.seedSubscription({
      configure: (b) =>
        b
          .withStatus('PAST_DUE')
          .withPastDueSince(world.daysAgo(15))
          .withTrialEndsAt(null)
          .withCountryCode('AR')
          .withCurrency('ARS'),
    });

    await expect(sweep(tenant)).rejects.toThrow();

    expect(await world.subscriptionRow(tenant.tenantId)).toMatchObject({
      status: 'PAST_DUE',
      suspensionReason: null,
    });
    expect(await world.chargeRows(tenant.tenantId)).toEqual([]);
  });

  it('touches only its own tenant: another tenant that is also due keeps its state and its charges', async () => {
    const swept = await pastDue();
    const other = await pastDue();
    const otherCharge = await world.seedCharge(other, { dueDate: overdue(), status: 'OVERDUE' });

    await sweep(swept);

    expect((await world.subscriptionRow(other.tenantId)).status).toBe('PAST_DUE');
    expect((await world.chargeRows(other.tenantId)).map((row) => [row.id, row.status])).toEqual([
      [otherCharge.id, 'OVERDUE'],
    ]);
  });
});
