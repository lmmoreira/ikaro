import { addDaysUTC, todayUTC } from '../../../../shared/utils/calendar-date';
import {
  createSweepWorld,
  type SweepTenant,
  type SweepWorld,
} from '../../../../test/utils/billing-sweep-world';

// The provider side of a local cancel, against Postgres: the flag is cleared under B-C1 on a fresh
// read, and a charge the provider reports paid goes through the one shared apply.
describe('ProviderChargeCancellationService (integration)', () => {
  let world: SweepWorld;
  let tenant: SweepTenant;

  beforeAll(async () => {
    world = await createSweepWorld();
  });

  beforeEach(async () => {
    tenant = await world.seedSubscription({
      configure: (b) => b.withSuspension('NON_PAYMENT', world.daysAgo(1)).withTrialEndsAt(null),
    });
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    await world.cleanup();
  });

  afterAll(async () => {
    await world.destroy();
  });

  // The caller's half, as the sweep's transaction does it: cancelled locally and flagged.
  const cancelledLocally = async () => {
    const charge = await world.seedCharge(tenant, { dueDate: addDaysUTC(todayUTC(), -20) });
    await world.txManager.run(async () => {
      const locked = await world.charges.findByIdForUpdate(tenant.tenantId, charge.id);
      locked!.cancel();
      locked!.markProviderCancelPending();
      await world.charges.save(locked!);
    });
    return charge;
  };
  const execute = (chargeIds: string[]) =>
    world.cancellation.execute({
      tenantId: tenant.tenantId,
      chargeIds,
      correlationId: 'corr-cancel',
    });
  const row = async (chargeId: string) =>
    (await world.chargeRows(tenant.tenantId)).find((r) => r.id === chargeId)!;

  it('cancels the charge at the provider and clears the flag in the database', async () => {
    const charge = await cancelledLocally();

    const result = await execute([charge.id]);

    expect(result).toMatchObject({ cancelled: 1, leftFlagged: 0 });
    expect(world.provider.charges.get(charge.providerChargeId!)?.state).toBe('CANCELED');
    expect(await row(charge.id)).toMatchObject({
      status: 'CANCELED',
      providerCancelPending: false,
    });
  });

  it('a provider that fails leaves the flag set for reconcile', async () => {
    const charge = await cancelledLocally();
    world.provider.failNextCall('UNAVAILABLE');

    const result = await execute([charge.id]);

    expect(result).toMatchObject({ cancelled: 0, leftFlagged: 1 });
    expect(await row(charge.id)).toMatchObject({ providerCancelPending: true });
  });

  it('a charge the provider reports paid is the payment: applied, the tenant reactivated', async () => {
    const charge = await cancelledLocally();
    world.provider.simulatePayment(charge.providerChargeId!, 'PIX');

    const result = await execute([charge.id]);

    expect(result).toMatchObject({ paid: 1 });
    expect(await row(charge.id)).toMatchObject({ status: 'PAID', providerCancelPending: false });
    expect((await world.subscriptionRow(tenant.tenantId)).status).toBe('ACTIVE');
  });
});
