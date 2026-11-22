import { AppLogger } from '../../../../shared/observability/app-logger';
import {
  ChargeBuilder,
  ChargeLineBuilder,
  SubscriptionBuilder,
} from '../../../../test/builders/billing';
import { createReconcileHarness } from '../../../../test/infrastructure/billing-reconcile-harness';
import type { Charge } from '../../domain/charge.aggregate';
import { providerOfMerchantProfileKey } from '../../domain/merchant-profile-key';
import type { Subscription } from '../../domain/subscription.aggregate';

describe('ChargeProviderSyncService (UC-116)', () => {
  let h: ReturnType<typeof createReconcileHarness>;

  beforeEach(() => {
    h = createReconcileHarness();
    jest.restoreAllMocks();
  });

  const command = (charge: Charge) => ({
    tenantId: charge.tenantId,
    chargeId: charge.id,
    correlationId: 'corr-sync',
  });

  const tenantWithCharge = async (
    status: 'ACTIVE' | 'PAST_DUE' = 'ACTIVE',
  ): Promise<{ subscription: Subscription; charge: Charge }> => {
    const subscription = new SubscriptionBuilder()
      .withStatus(status)
      .withItems([h.hotsiteItem()])
      .build();
    await h.seedTenant(subscription);
    // The period covers the harness's "today" (2026-03-10): only then does a reversal suspend.
    const charge = await h.seedCharge(subscription, {
      dueDate: '2026-03-10',
      period: ['2026-03-01', '2026-03-31'],
    });
    return { subscription, charge };
  };

  describe('what the provider says against what we hold', () => {
    it('applies a payment the webhook never delivered, through the shared apply, and publishes ChargePaid once', async () => {
      const { charge } = await tenantWithCharge();
      h.provider.simulatePayment(charge.providerChargeId!, 'PIX'); // the webhook is never drained
      const apply = jest.spyOn(h.applyFact, 'executeWithReport');

      const result = await h.sync.sync(command(charge));

      expect(result.outcome).toBe('APPLIED');
      expect(result.merchantProfileKey).toBe('BRL_FAKE');
      expect(charge.status).toBe('PAID');
      expect(apply).toHaveBeenCalledTimes(1);
      expect(apply.mock.calls[0][0].fact).toMatchObject({ type: 'PAID', method: 'PIX' });
      expect(h.outbox.published.filter((e) => e.eventName === 'ChargePaid')).toHaveLength(1);
    });

    it('reactivates a PAST_DUE tenant whose payment was never heard about', async () => {
      const { subscription, charge } = await tenantWithCharge('PAST_DUE');
      h.provider.simulatePayment(charge.providerChargeId!, 'CARD');

      await h.sync.sync(command(charge));

      expect(subscription.status).toBe('ACTIVE');
    });

    it('a charge already paid here that the provider also says is paid changes nothing', async () => {
      const { charge } = await tenantWithCharge();
      h.provider.simulatePayment(charge.providerChargeId!, 'PIX');
      await h.sync.sync(command(charge));
      h.outbox.published.length = 0;

      const again = await h.sync.sync(command(charge));

      expect(again.outcome).toBe('NO_CHANGE');
      expect(h.outbox.published).toEqual([]);
    });

    it('a full refund the webhook missed suspends the tenant, and its recovery charge is made payable after commit', async () => {
      const { subscription, charge } = await tenantWithCharge();
      h.provider.simulatePayment(charge.providerChargeId!, 'PIX');
      await h.sync.sync(command(charge));
      h.provider.simulateRefund(charge.providerChargeId!, 'FULL');

      const result = await h.sync.sync(command(charge));

      expect(result.outcome).toBe('APPLIED');
      expect(subscription.suspensionReason).toBe('PAYMENT_REVERSED');
      const recovery = h.charges.saved.find((c) => c.kind === 'RECOVERY');
      expect(recovery?.providerCreationStatus).toBe('READY');
      expect(recovery?.providerChargeId).not.toBeNull();
    });

    it('a chargeback the webhook missed is applied the same way', async () => {
      const { subscription, charge } = await tenantWithCharge();
      h.provider.simulatePayment(charge.providerChargeId!, 'PIX');
      await h.sync.sync(command(charge));
      h.provider.simulateChargeback(charge.providerChargeId!);

      const result = await h.sync.sync(command(charge));

      expect(result.outcome).toBe('APPLIED');
      expect(subscription.suspensionReason).toBe('PAYMENT_REVERSED');
    });

    it('a recovery charge that cannot be made payable is logged, never thrown: it stays PENDING for the retry', async () => {
      const { charge } = await tenantWithCharge();
      h.provider.simulatePayment(charge.providerChargeId!, 'PIX');
      await h.sync.sync(command(charge));
      h.provider.simulateRefund(charge.providerChargeId!, 'FULL');
      jest.spyOn(h.creation, 'execute').mockRejectedValue(new Error('provider down'));
      const logged = jest.spyOn(AppLogger.prototype, 'error').mockImplementation();

      await expect(h.sync.sync(command(charge))).resolves.toMatchObject({ outcome: 'APPLIED' });

      expect(logged).toHaveBeenCalledWith(
        expect.stringContaining('billing_recovery_creation_failed'),
        expect.anything(),
        expect.objectContaining({ tenantId: charge.tenantId }),
      );
      expect(h.charges.saved.find((c) => c.kind === 'RECOVERY')?.providerCreationStatus).toBe(
        'PENDING',
      );
    });

    it.each(['simulateOverdue', 'untouched'] as const)(
      'a provider that says %s changes nothing here (the sweep owns overdue)',
      async (scenario) => {
        const { charge } = await tenantWithCharge();
        if (scenario === 'simulateOverdue') h.provider.simulateOverdue(charge.providerChargeId!);
        const apply = jest.spyOn(h.applyFact, 'executeWithReport');

        const result = await h.sync.sync(command(charge));

        expect(result.outcome).toBe('UNCHANGED');
        expect(apply).not.toHaveBeenCalled();
        expect(charge.status).toBe('PENDING');
      },
    );

    // The drift matrix: what the provider says against what we hold, and the one outcome each pair has.
    describe.each([
      ['PENDING', 'PAID', 'APPLIED'],
      ['PENDING', 'PENDING', 'UNCHANGED'],
      ['PENDING', 'OVERDUE', 'UNCHANGED'],
      ['OVERDUE', 'PAID', 'APPLIED'],
      ['OVERDUE', 'OVERDUE', 'UNCHANGED'],
      ['PAID', 'PAID', 'NO_CHANGE'],
      ['PAID', 'REFUNDED', 'APPLIED'],
      ['PAID', 'CHARGEBACK', 'APPLIED'],
    ] as const)('local %s, provider %s', (local, provider, expected) => {
      it(`is ${expected}`, async () => {
        const { charge } = await tenantWithCharge();
        const id = charge.providerChargeId!;
        if (local === 'PAID') {
          h.provider.simulatePayment(id, 'PIX');
          await h.sync.sync(command(charge));
        }
        if (local === 'OVERDUE') {
          charge.markOverdue();
        }
        if (provider === 'OVERDUE') h.provider.simulateOverdue(id);
        if (provider === 'PAID' && local !== 'PAID') h.provider.simulatePayment(id, 'PIX');
        if (provider === 'REFUNDED') h.provider.simulateRefund(id, 'FULL');
        if (provider === 'CHARGEBACK') h.provider.simulateChargeback(id);

        expect((await h.sync.sync(command(charge))).outcome).toBe(expected);
      });
    });

    it('a charge the provider cancelled while it is open here is logged as a drift and left alone', async () => {
      const { charge } = await tenantWithCharge();
      await h.provider.cancelCharge(charge.providerChargeId!);
      const warned = jest.spyOn(AppLogger.prototype, 'warn').mockImplementation();

      const result = await h.sync.sync(command(charge));

      expect(result.outcome).toBe('UNCHANGED');
      expect(warned).toHaveBeenCalledWith(
        'billing_reconcile_drift_unapplied',
        expect.objectContaining({ chargeId: charge.id, providerState: 'CANCELED' }),
      );
    });
  });

  describe('what it refuses to use', () => {
    it('a read that does not describe our charge (another amount) is skipped, logged and never applied', async () => {
      const { subscription, charge } = await tenantWithCharge();
      // A second local charge bound to the first one's provider charge: the amounts differ.
      const impostor = new ChargeBuilder()
        .withTenantId(subscription.tenantId)
        .withSubscriptionId(subscription.id)
        .withPeriod('2026-04-01', '2026-04-30')
        .withDueDate('2026-04-10')
        .withLines([
          new ChargeLineBuilder().withUnitPriceMinor(charge.amount.amountMinor + 1).build(),
        ])
        .withProviderReady(
          providerOfMerchantProfileKey(subscription.merchantProfileKey),
          charge.providerChargeId!,
        )
        .build();
      await h.charges.save(impostor);
      h.provider.simulatePayment(charge.providerChargeId!, 'PIX');
      const apply = jest.spyOn(h.applyFact, 'executeWithReport');
      const warned = jest.spyOn(AppLogger.prototype, 'warn').mockImplementation();

      const result = await h.sync.sync(command(impostor));

      expect(result.outcome).toBe('MISMATCH');
      expect(apply).not.toHaveBeenCalled();
      expect(impostor.status).toBe('PENDING');
      expect(warned).toHaveBeenCalledWith(
        'billing_reconcile_mismatch',
        expect.objectContaining({ mismatch: 'AMOUNT_MISMATCH' }),
      );
    });

    it('a charge with no provider charge yet makes no provider call', async () => {
      const subscription = new SubscriptionBuilder()
        .withStatus('ACTIVE')
        .withItems([h.hotsiteItem()])
        .build();
      await h.seedTenant(subscription);
      const charge = await h.seedCharge(subscription, { dueDate: '2026-03-10', ready: false });
      const fetched = jest.spyOn(h.provider, 'fetchChargeStatus');

      const result = await h.sync.sync(command(charge));

      expect(result).toEqual({ outcome: 'SKIPPED', merchantProfileKey: null });
      expect(fetched).not.toHaveBeenCalled();
    });

    it('another tenant asking for this charge finds nothing and reads nothing', async () => {
      const { charge } = await tenantWithCharge();
      const fetched = jest.spyOn(h.provider, 'fetchChargeStatus');

      const result = await h.sync.sync({ ...command(charge), tenantId: 'other-tenant' });

      expect(result.outcome).toBe('SKIPPED');
      expect(fetched).not.toHaveBeenCalled();
    });
  });

  it('a provider error propagates untouched: the caller counts it, and the charge is unchanged', async () => {
    const { charge } = await tenantWithCharge();
    h.provider.failNextCall('UNAVAILABLE');

    await expect(h.sync.sync(command(charge))).rejects.toBeDefined();

    expect(charge.status).toBe('PENDING');
  });

  describe('a key no adapter serves yet', () => {
    it('is SKIPPED, logged at warn and never reaches the provider, with no error', async () => {
      const warn = jest.spyOn(AppLogger.prototype, 'warn').mockImplementation();
      const error = jest.spyOn(AppLogger.prototype, 'error').mockImplementation();
      const subscription = new SubscriptionBuilder()
        .withStatus('ACTIVE')
        .withMerchantProfileKey('BRL_ASAAS_SANDBOX')
        .withItems([h.hotsiteItem()])
        .build();
      await h.seedTenant(subscription);
      const charge = await h.seedCharge(subscription, { dueDate: '2026-03-10' });
      const fetch = jest.spyOn(h.provider, 'fetchChargeStatus');

      const result = await h.sync.sync(command(charge));

      expect(result).toEqual({ outcome: 'SKIPPED', merchantProfileKey: null });
      expect(fetch).not.toHaveBeenCalled();
      expect(warn).toHaveBeenCalledWith('billing_provider_not_supported: skipped', {
        tenantId: charge.tenantId,
        chargeId: charge.id,
        merchantProfileKey: 'BRL_ASAAS_SANDBOX',
      });
      expect(error).not.toHaveBeenCalled();
    });
  });
});
