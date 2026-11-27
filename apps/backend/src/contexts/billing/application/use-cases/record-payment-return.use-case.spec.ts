import { ChargeBuilder, SubscriptionBuilder } from '../../../../test/builders/billing';
import { createReconcileHarness } from '../../../../test/infrastructure/billing-reconcile-harness';
import type { Charge } from '../../domain/charge.aggregate';
import { ChargeNotFoundError } from '../../domain/errors/billing-domain.error';
import type { Subscription } from '../../domain/subscription.aggregate';

describe('RecordPaymentReturnUseCase (UC-119, the on-demand refresh of UC-116)', () => {
  let h: ReturnType<typeof createReconcileHarness>;
  let subscription: Subscription;
  let charge: Charge;

  beforeEach(async () => {
    h = createReconcileHarness();
    subscription = new SubscriptionBuilder()
      .withStatus('ACTIVE')
      .withItems([h.hotsiteItem()])
      .build();
    await h.seedTenant(subscription);
    charge = await h.seedCharge(subscription, {
      dueDate: '2026-03-10',
      period: ['2026-03-01', '2026-03-31'],
    });
  });

  const returnTo = (target: Charge = charge, tenantId = target.tenantId) =>
    h.recordReturn.execute({ tenantId, chargeId: target.id, correlationId: 'corr-return' });

  const stored = async (target: Charge = charge): Promise<Charge> => {
    const found = await h.charges.findById(target.tenantId, target.id);
    if (found === null) throw new Error('the charge disappeared');
    return found;
  };

  describe('recording the return', () => {
    it('records the return once and answers that the payment is awaited', async () => {
      await expect(returnTo()).resolves.toEqual({
        status: 'PENDING',
        paymentConfirmationPending: true,
      });

      expect((await stored()).paymentReturnSeenAt).toEqual(h.clock.now());
    });

    it('keeps the first return: a second one changes nothing and writes nothing', async () => {
      await returnTo();
      const first = await stored();
      h.clock.advanceMs(30 * 60_000);
      const saved = jest.spyOn(h.charges, 'save');

      await returnTo();

      expect((await stored()).paymentReturnSeenAt).toEqual(first.paymentReturnSeenAt);
      expect(saved).not.toHaveBeenCalled();
    });

    it('an overdue charge is awaited too', async () => {
      const overdue = await h.seedCharge(subscription, {
        dueDate: '2026-02-01',
        period: ['2026-02-01', '2026-02-28'],
        status: 'OVERDUE',
      });

      await expect(returnTo(overdue)).resolves.toEqual({
        status: 'OVERDUE',
        paymentConfirmationPending: true,
      });
    });
  });

  describe('the on-demand refresh', () => {
    it('answers paid as soon as the provider says so, without waiting for the webhook', async () => {
      h.provider.simulatePayment(charge.providerChargeId!, 'PIX');

      await expect(returnTo()).resolves.toEqual({
        status: 'PAID',
        paymentConfirmationPending: false,
      });
    });

    it('answers the unchanged state when nothing changed at the provider', async () => {
      await expect(returnTo()).resolves.toMatchObject({
        status: 'PENDING',
        paymentConfirmationPending: true,
      });
    });

    it('never fails because the provider is unreachable: the state comes back unchanged and the page keeps polling', async () => {
      h.provider.failNextCall('UNAVAILABLE');

      await expect(returnTo()).resolves.toEqual({
        status: 'PENDING',
        paymentConfirmationPending: true,
      });

      expect((await stored()).paymentReturnSeenAt).not.toBeNull();
    });

    it('never fails for a merchant profile no adapter serves yet, and reads nothing at the provider', async () => {
      const sandbox = new SubscriptionBuilder()
        .withStatus('ACTIVE')
        .withMerchantProfileKey('BRL_ASAAS_SANDBOX')
        .withItems([h.hotsiteItem()])
        .build();
      await h.seedTenant(sandbox);
      const heldOnSandbox = new ChargeBuilder()
        .withTenantId(sandbox.tenantId)
        .withSubscriptionId(sandbox.id)
        .withMerchantProfileKey('BRL_ASAAS_SANDBOX')
        .withProviderReady('ASAAS', 'pay_sandbox')
        .build();
      await h.charges.save(heldOnSandbox);
      const fetched = jest.spyOn(h.provider, 'fetchChargeStatus');

      await expect(returnTo(heldOnSandbox)).resolves.toEqual({
        status: 'PENDING',
        paymentConfirmationPending: true,
      });

      expect(fetched).not.toHaveBeenCalled();
    });
  });

  describe('a charge that is not open', () => {
    it('a paid charge records nothing and reads nothing: it answers its state', async () => {
      const paid = await stored();
      paid.markPaid('PIX', h.clock.now(), null, 'corr', null);
      await h.charges.save(paid);
      const fetched = jest.spyOn(h.provider, 'fetchChargeStatus');

      await expect(returnTo()).resolves.toEqual({
        status: 'PAID',
        paymentConfirmationPending: false,
      });

      expect((await stored()).paymentReturnSeenAt).toBeNull();
      expect(fetched).not.toHaveBeenCalled();
    });

    it.each(['CANCELED', 'REFUNDED', 'CHARGEBACK'] as const)(
      'a %s charge records nothing and answers its state',
      async (status) => {
        const closed = await h.seedCharge(subscription, {
          dueDate: '2026-02-01',
          period: ['2026-02-01', '2026-02-28'],
          status,
        });

        await expect(returnTo(closed)).resolves.toEqual({
          status,
          paymentConfirmationPending: false,
        });

        expect((await stored(closed)).paymentReturnSeenAt).toBeNull();
      },
    );

    it('a charge a webhook settled between the read and the lock records nothing', async () => {
      const lock = h.charges.findByIdForUpdate.bind(h.charges);
      jest.spyOn(h.charges, 'findByIdForUpdate').mockImplementationOnce(async (tenantId, id) => {
        const current = await stored();
        current.markPaid('PIX', h.clock.now(), null, 'corr', null);
        await h.charges.save(current);
        return lock(tenantId, id);
      });

      await expect(returnTo()).resolves.toEqual({
        status: 'PAID',
        paymentConfirmationPending: false,
      });

      expect((await stored()).paymentReturnSeenAt).toBeNull();
    });
  });

  describe('which charge it answers for', () => {
    it('another tenant’s charge id is not found: nothing is recorded or read at the provider', async () => {
      const fetched = jest.spyOn(h.provider, 'fetchChargeStatus');

      await expect(returnTo(charge, 'some-other-tenant')).rejects.toThrow(ChargeNotFoundError);

      expect((await stored()).paymentReturnSeenAt).toBeNull();
      expect(fetched).not.toHaveBeenCalled();
    });

    it('an unknown charge id is not found', async () => {
      await expect(
        h.recordReturn.execute({
          tenantId: charge.tenantId,
          chargeId: 'unknown',
          correlationId: 'corr-return',
        }),
      ).rejects.toThrow(ChargeNotFoundError);
    });
  });
});
