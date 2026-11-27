import { addDaysUTC, todayInTimezone, todayUTC } from '../../../../shared/utils/calendar-date';
import {
  createReconcileWorld,
  type ReconcileWorld,
} from '../../../../test/utils/billing-reconcile-world';

// Reconcile with its real cross-tenant selectors, row locks and apply against Postgres. It selects
// across every tenant in the (shared) database, so each assertion looks at this spec's own tenants
// only; the integration suites run one after another and clean up behind themselves.
describe('ReconcileChargesJob (integration, UC-116)', () => {
  let world: ReconcileWorld;

  beforeAll(async () => {
    world = await createReconcileWorld();
  });

  beforeEach(() => {
    world.outbox.published.length = 0;
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    await world.cleanup();
  });

  afterAll(async () => {
    await world.destroy();
  });

  const run = () => world.reconcile.run({ correlationId: 'corr-reconcile' });
  const statusOf = async (tenantId: string) => (await world.subscriptionRow(tenantId)).status;
  const chargePaidFor = (tenantId: string) =>
    world.outbox.published.filter((e) => e.eventName === 'ChargePaid' && e.tenantId === tenantId);
  const overdueTenant = () =>
    world.seedSubscription({
      configure: (b) =>
        b.withStatus('PAST_DUE').withPastDueSince(world.daysAgo(5)).withTrialEndsAt(null),
    });

  it('picks up a payment the webhook never delivered and reactivates the tenant, publishing ChargePaid once', async () => {
    const tenant = await overdueTenant();
    const charge = await world.seedCharge(tenant, {
      dueDate: addDaysUTC(todayUTC(), -5),
      status: 'OVERDUE',
    });
    world.provider.simulatePayment(charge.providerChargeId!, 'PIX'); // never drained: a dropped webhook

    const result = await run();

    expect(result.drifted).toBeGreaterThanOrEqual(1);
    expect((await world.chargeRows(tenant.tenantId))[0].status).toBe('PAID');
    expect(await statusOf(tenant.tenantId)).toBe('ACTIVE');
    expect(chargePaidFor(tenant.tenantId)).toHaveLength(1);
  });

  it('corrects an ACTIVE tenant whose charge is due today before the sweep can turn it PAST_DUE', async () => {
    const tenant = await world.seedSubscription({
      configure: (b) => b.withStatus('ACTIVE').withTrialEndsAt(null),
    });
    // The subscription's own "today" (São Paulo): the job's UTC date selection is a superset of it.
    const charge = await world.seedCharge(tenant, {
      dueDate: todayInTimezone('America/Sao_Paulo'),
    });
    world.provider.simulatePayment(charge.providerChargeId!, 'CARD');

    await run();
    await world.sweep.run({ correlationId: 'corr-sweep' });

    expect(await statusOf(tenant.tenantId)).toBe('ACTIVE');
  });

  it('reaches a SUSPENDED tenant (no operational-status filter): its paid recovery charge reactivates it', async () => {
    const tenant = await world.seedSubscription({
      configure: (b) =>
        b
          .withStatus('SUSPENDED')
          .withSuspension('NON_PAYMENT', world.daysAgo(2))
          .withTrialEndsAt(null),
    });
    const recovery = await world.seedCharge(tenant, {
      kind: 'RECOVERY',
      dueDate: addDaysUTC(todayUTC(), 5),
    });
    world.provider.simulatePayment(recovery.providerChargeId!, 'PIX');

    await run();

    expect(await statusOf(tenant.tenantId)).toBe('ACTIVE');
  });

  it('stamps the provider account after a complete run and writes only its own columns', async () => {
    const tenant = await overdueTenant();
    await world.seedCharge(tenant, { dueDate: addDaysUTC(todayUTC(), -5), status: 'OVERDUE' });

    const result = await run();

    const row = await world.health.findByKey('BRL_FAKE');
    expect(result.truncated).toBe(false);
    expect(row?.lastReconcileOkAt).not.toBeNull();
    expect(row).toMatchObject({ freezeActive: false, webhookStatus: 'UNKNOWN' });
  });

  describe('reconcile and the webhook on the same charge (lock B-R1, then B-C1)', () => {
    it('applied at the same time, the payment lands once: ChargePaid is published once and the tenant ends ACTIVE', async () => {
      const tenant = await overdueTenant();
      const charge = await world.seedCharge(tenant, {
        dueDate: addDaysUTC(todayUTC(), -5),
        status: 'OVERDUE',
      });
      world.provider.simulatePayment(charge.providerChargeId!, 'PIX');
      const webhook = () =>
        world.applyFact.execute({
          tenantId: tenant.tenantId,
          chargeId: charge.id,
          fact: { type: 'PAID', method: 'PIX', paidAt: new Date(), receiptUrl: null },
          recipientEmail: null,
          correlationId: 'corr-webhook',
        });
      const reconcile = () =>
        world.reconcileOne.execute({
          tenantId: tenant.tenantId,
          chargeId: charge.id,
          correlationId: 'corr-reconcile',
        });

      const [applied, synced] = await Promise.all([webhook(), reconcile()]);

      expect([applied, synced.outcome].filter((r) => r === 'APPLIED')).toHaveLength(1);
      expect(chargePaidFor(tenant.tenantId)).toHaveLength(1);
      expect(await statusOf(tenant.tenantId)).toBe('ACTIVE');
    });

    it('a second reconcile of the settled charge changes nothing and publishes nothing', async () => {
      const tenant = await overdueTenant();
      const charge = await world.seedCharge(tenant, {
        dueDate: addDaysUTC(todayUTC(), -5),
        status: 'OVERDUE',
      });
      world.provider.simulatePayment(charge.providerChargeId!, 'PIX');
      const input = {
        tenantId: tenant.tenantId,
        chargeId: charge.id,
        correlationId: 'corr-reconcile',
      };
      await world.reconcileOne.execute(input);
      world.outbox.published.length = 0;

      const again = await world.reconcileOne.execute(input);

      expect(again.outcome).toBe('NO_CHANGE');
      expect(world.outbox.published).toEqual([]);
    });
  });

  // The staging state: the M25-S05 backfill gave every tenant `BRL_ASAAS_SANDBOX`, and the registry
  // has no adapter for it until M26-S37. The run used to throw on it, nack and dead-letter.
  it('a subscription on a key no adapter serves yet does not fail the run: the served account is still reconciled', async () => {
    const sandbox = await world.seedSubscription({
      configure: (b) => b.withStatus('ACTIVE').withMerchantProfileKey('BRL_ASAAS_SANDBOX'),
    });
    const tenant = await overdueTenant();
    const charge = await world.seedCharge(tenant, {
      dueDate: addDaysUTC(todayUTC(), -5),
      status: 'OVERDUE',
    });
    world.provider.simulatePayment(charge.providerChargeId!, 'PIX');

    const result = await run();

    expect(result.drifted).toBeGreaterThanOrEqual(1);
    expect(await statusOf(tenant.tenantId)).toBe('ACTIVE');
    expect((await world.subscriptionRow(sandbox.tenantId)).merchantProfileKey).toBe(
      'BRL_ASAAS_SANDBOX',
    );
    expect(await world.health.findByKey('BRL_ASAAS_SANDBOX')).toBeNull();
    expect((await world.health.findByKey('BRL_FAKE'))?.lastReconcileOkAt).not.toBeNull();
  });
});
