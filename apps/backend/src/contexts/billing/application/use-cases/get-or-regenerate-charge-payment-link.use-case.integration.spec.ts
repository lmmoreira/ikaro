import { getActiveEntityManager } from '../../../../shared/infrastructure/transaction-context';
import { addDaysUTC, todayUTC } from '../../../../shared/utils/calendar-date';
import {
  createReconcileWorld,
  type ReconcileWorld,
} from '../../../../test/utils/billing-reconcile-world';
import { waitForParkedBehind } from '../../../../test/utils/booking-lock-race-world';
import {
  BillingAddressRequiredError,
  ChargeNotFoundError,
} from '../../domain/errors/billing-domain.error';

// The payment link against Postgres: the real charge repository, the row lock (docs/LOCK_CATALOG.md
// B-C1) and the fake provider. The clock is the real one, so every instant is relative to now.
describe('GetOrRegenerateChargePaymentLinkUseCase (integration, UC-119)', () => {
  let world: ReconcileWorld;

  beforeAll(async () => {
    world = await createReconcileWorld();
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    await world.cleanup();
  });

  afterAll(async () => {
    await world.destroy();
  });

  const activeTenant = () =>
    world.seedSubscription({ configure: (b) => b.withStatus('ACTIVE').withTrialEndsAt(null) });
  const expired = () => new Date(Date.now() - 60_000);
  const chargeRow = async (tenantId: string) => (await world.chargeRows(tenantId))[0];

  it('regenerates an expired link and stores it, leaving the status alone', async () => {
    const tenant = await activeTenant();
    const charge = await world.seedCharge(tenant, {
      dueDate: addDaysUTC(todayUTC(), 3),
      paymentUrlExpiresAt: expired(),
    });

    const answer = await world.paymentLink.execute({
      tenantId: tenant.tenantId,
      chargeId: charge.id,
    });

    const row = await chargeRow(tenant.tenantId);
    expect(answer).toMatchObject({ status: 'PENDING', paymentUrl: expect.any(String) });
    expect(row.paymentUrl).toBe(answer.paymentUrl);
    expect(row.paymentUrlExpiresAt!.getTime()).toBeGreaterThan(Date.now());
    expect(row.status).toBe('PENDING');
  });

  it('answers another tenant’s charge as not found and asks the provider for nothing', async () => {
    const owner = await activeTenant();
    const stranger = await activeTenant();
    const charge = await world.seedCharge(owner, {
      dueDate: addDaysUTC(todayUTC(), 3),
      paymentUrlExpiresAt: expired(),
    });
    const regenerate = jest.spyOn(world.provider, 'regeneratePaymentLink');

    await expect(
      world.paymentLink.execute({ tenantId: stranger.tenantId, chargeId: charge.id }),
    ).rejects.toThrow(ChargeNotFoundError);

    expect(regenerate).not.toHaveBeenCalled();
    expect((await chargeRow(owner.tenantId)).paymentUrlExpiresAt!.getTime()).toBeLessThan(
      Date.now(),
    );
  });

  it('holds a recovery charge the status sweep inserted for a tenant with no billing identity', async () => {
    const tenant = await world.seedSubscription({
      configure: (b) =>
        b
          .withStatus('SUSPENDED')
          .withSuspension('NON_PAYMENT', new Date(Date.now() - 24 * 60 * 60 * 1000))
          .withTrialEndsAt(null),
      billable: false,
    });
    const held = await world.seedCharge(tenant, {
      kind: 'RECOVERY',
      dueDate: todayUTC(),
      ready: false,
    });
    const regenerate = jest.spyOn(world.provider, 'regeneratePaymentLink');

    await expect(
      world.paymentLink.execute({ tenantId: tenant.tenantId, chargeId: held.id }),
    ).rejects.toThrow(BillingAddressRequiredError);

    expect(regenerate).not.toHaveBeenCalled();
  });

  it('B-C1: a payment landing between the provider call and the store is not overwritten: the link is stored, the status stays PAID and the answer is the paid state', async () => {
    const tenant = await activeTenant();
    const charge = await world.seedCharge(tenant, {
      dueDate: addDaysUTC(todayUTC(), 3),
      paymentUrlExpiresAt: expired(),
    });
    let release!: () => void;
    let signalLocked!: (holderPid: number) => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const locked = new Promise<number>((resolve) => (signalLocked = resolve));
    // The webhook's shape (docs/LOCK_CATALOG.md § 4): the subscription row, then the charge row,
    // paid and committed after the link store has had to wait for it. It reports its own backend
    // pid, so the probe below is satisfied only by a session parked behind this transaction.
    const payment = world.txManager.run(async () => {
      const subscription = await world.subscriptions.findByTenantIdForUpdate(tenant.tenantId);
      const current = await world.charges.findByIdForUpdate(tenant.tenantId, charge.id);
      if (!subscription || !current) throw new Error('seeded rows missing');
      current.markPaid('PIX', new Date(), null, 'corr-webhook', null);
      await world.charges.save(current);
      const [{ pid }] = await getActiveEntityManager()!.query<{ pid: number }[]>(
        'SELECT pg_backend_pid() AS pid',
      );
      signalLocked(pid);
      await gate;
    });
    const holderPid = await locked;

    const answering = world.paymentLink.execute({
      tenantId: tenant.tenantId,
      chargeId: charge.id,
    });
    try {
      await waitForParkedBehind(world.ds, holderPid);
    } finally {
      release();
      await payment;
    }

    await expect(answering).resolves.toEqual({ status: 'PAID', paymentUrl: null, expiresAt: null });
    const row = await chargeRow(tenant.tenantId);
    expect(row.status).toBe('PAID');
    expect(row.paymentUrlExpiresAt!.getTime()).toBeGreaterThan(Date.now());
  });
});
