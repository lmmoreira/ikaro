import { addDaysUTC, todayUTC } from '../../../../shared/utils/calendar-date';
import {
  createReconcileWorld,
  type ReconcileWorld,
} from '../../../../test/utils/billing-reconcile-world';
import { databaseNow, waitForBlockedLock } from '../../../../test/utils/booking-lock-race-world';
import { ChargeNotFoundError } from '../../domain/errors/billing-domain.error';

// The payment return against Postgres: the real charge and subscription repositories, the row locks
// (docs/LOCK_CATALOG.md B-R1, B-C1), the shared apply and the fake provider.
describe('RecordPaymentReturnUseCase (integration, UC-119, UC-116)', () => {
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

  const pastDueTenant = () =>
    world.seedSubscription({
      configure: (b) =>
        b.withStatus('PAST_DUE').withPastDueSince(world.daysAgo(5)).withTrialEndsAt(null),
    });
  const overdueCharge = async (tenant: Awaited<ReturnType<typeof pastDueTenant>>) =>
    world.seedCharge(tenant, { dueDate: addDaysUTC(todayUTC(), -5), status: 'OVERDUE' });
  const returnTo = (tenantId: string, chargeId: string) =>
    world.recordReturn.execute({ tenantId, chargeId, correlationId: 'corr-return' });
  const chargeRow = async (tenantId: string) => (await world.chargeRows(tenantId))[0];

  it('refreshes the charge on the return: a payment the webhook never delivered is applied and the PAST_DUE tenant is reactivated', async () => {
    const tenant = await pastDueTenant();
    const charge = await overdueCharge(tenant);
    world.provider.simulatePayment(charge.providerChargeId!, 'PIX'); // never drained: a dropped webhook

    const answer = await returnTo(tenant.tenantId, charge.id);

    expect(answer).toEqual({ status: 'PAID', paymentConfirmationPending: false });
    expect((await world.subscriptionRow(tenant.tenantId)).status).toBe('ACTIVE');
    expect(
      world.outbox.published.filter(
        (e) => e.eventName === 'ChargePaid' && e.tenantId === tenant.tenantId,
      ),
    ).toHaveLength(1);
  });

  it('records the return once and awaits the payment while the provider says nothing new', async () => {
    const tenant = await pastDueTenant();
    const charge = await overdueCharge(tenant);

    const answer = await returnTo(tenant.tenantId, charge.id);
    const first = (await chargeRow(tenant.tenantId)).paymentReturnSeenAt;
    await returnTo(tenant.tenantId, charge.id);

    expect(answer).toEqual({ status: 'OVERDUE', paymentConfirmationPending: true });
    expect(first).not.toBeNull();
    expect((await chargeRow(tenant.tenantId)).paymentReturnSeenAt).toEqual(first);
  });

  it('never fails because the provider is unreachable: the state comes back unchanged', async () => {
    const tenant = await pastDueTenant();
    const charge = await overdueCharge(tenant);
    world.provider.failNextCall('UNAVAILABLE');

    await expect(returnTo(tenant.tenantId, charge.id)).resolves.toEqual({
      status: 'OVERDUE',
      paymentConfirmationPending: true,
    });
    expect((await world.subscriptionRow(tenant.tenantId)).status).toBe('PAST_DUE');
  });

  it('answers another tenant’s charge as not found: nothing is recorded or read at the provider', async () => {
    const owner = await pastDueTenant();
    const stranger = await pastDueTenant();
    const charge = await overdueCharge(owner);
    const fetched = jest.spyOn(world.provider, 'fetchChargeStatus');

    await expect(returnTo(stranger.tenantId, charge.id)).rejects.toThrow(ChargeNotFoundError);

    expect((await chargeRow(owner.tenantId)).paymentReturnSeenAt).toBeNull();
    expect(fetched).not.toHaveBeenCalled();
  });

  it('B-C1: a payment landing between the read and the lock is not overwritten: nothing is recorded and the answer is the paid state', async () => {
    const tenant = await pastDueTenant();
    const charge = await overdueCharge(tenant);
    let release!: () => void;
    let signalLocked!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const locked = new Promise<void>((resolve) => (signalLocked = resolve));
    // The webhook's shape: the subscription row, then the charge row, paid and committed after the
    // return has had to wait for it.
    const payment = world.txManager.run(async () => {
      const subscription = await world.subscriptions.findByTenantIdForUpdate(tenant.tenantId);
      const current = await world.charges.findByIdForUpdate(tenant.tenantId, charge.id);
      if (!subscription || !current) throw new Error('seeded rows missing');
      current.markPaid('PIX', new Date(), null, 'corr-webhook', null);
      await world.charges.save(current);
      signalLocked();
      await gate;
    });
    await locked;

    const since = await databaseNow(world.ds);
    const answering = returnTo(tenant.tenantId, charge.id);
    try {
      await waitForBlockedLock(world.ds, 'row', since);
    } finally {
      release();
      await payment;
    }

    await expect(answering).resolves.toEqual({ status: 'PAID', paymentConfirmationPending: false });
    const row = await chargeRow(tenant.tenantId);
    expect(row.status).toBe('PAID');
    expect(row.paymentReturnSeenAt).toBeNull();
  });
});
