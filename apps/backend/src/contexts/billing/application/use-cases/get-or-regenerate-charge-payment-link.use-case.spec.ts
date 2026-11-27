import { ChargeBuilder, SubscriptionBuilder } from '../../../../test/builders/billing';
import { createReconcileHarness } from '../../../../test/infrastructure/billing-reconcile-harness';
import type { Charge } from '../../domain/charge.aggregate';
import {
  BillingAddressRequiredError,
  BillingProviderUnavailableError,
  ChargeNotFoundError,
  ChargeNotPayableError,
} from '../../domain/errors/billing-domain.error';
import { ProviderNotSupportedError } from '../../domain/errors/billing-provider.errors';
import type { Subscription } from '../../domain/subscription.aggregate';

const LINK_TTL_MS = 7 * 24 * 60 * 60 * 1000;

describe('GetOrRegenerateChargePaymentLinkUseCase (UC-119)', () => {
  let h: ReturnType<typeof createReconcileHarness>;
  let subscription: Subscription;
  let regenerate: jest.SpyInstance;

  beforeEach(async () => {
    h = createReconcileHarness();
    subscription = new SubscriptionBuilder()
      .withStatus('ACTIVE')
      .withItems([h.hotsiteItem()])
      .build();
    await h.seedTenant(subscription);
    regenerate = jest.spyOn(h.provider, 'regeneratePaymentLink');
  });

  const seed = (options: Partial<Parameters<typeof h.seedCharge>[1]> = {}) =>
    h.seedCharge(subscription, {
      dueDate: '2026-03-10',
      period: ['2026-03-01', '2026-03-31'],
      ...options,
    });

  const link = (charge: Charge, tenantId = charge.tenantId) =>
    h.paymentLink.execute({ tenantId, chargeId: charge.id });

  const stored = async (charge: Charge): Promise<Charge> => {
    const found = await h.charges.findById(charge.tenantId, charge.id);
    if (found === null) throw new Error('the charge disappeared');
    return found;
  };

  const past = () => new Date(h.clock.now().getTime() - 60_000);
  const future = () => new Date(h.clock.now().getTime() + 60_000);

  describe('which charge it answers for', () => {
    it('an unknown charge id is not found', async () => {
      const charge = await seed();

      await expect(
        h.paymentLink.execute({ tenantId: charge.tenantId, chargeId: 'x' }),
      ).rejects.toThrow(ChargeNotFoundError);
    });

    it('another tenant’s charge id is not found and nothing is asked of the provider', async () => {
      const charge = await seed({ paymentUrlExpiresAt: past() });

      await expect(link(charge, 'some-other-tenant')).rejects.toThrow(ChargeNotFoundError);

      expect(regenerate).not.toHaveBeenCalled();
    });

    it.each(['CANCELED', 'REFUNDED', 'CHARGEBACK'] as const)(
      'a %s charge can no longer be paid, and the provider is not asked',
      async (status) => {
        const charge = await seed({ status, paymentUrlExpiresAt: past() });

        await expect(link(charge)).rejects.toThrow(ChargeNotPayableError);

        expect(regenerate).not.toHaveBeenCalled();
      },
    );

    it('an already-paid charge answers the paid state with no link, not an error (A4)', async () => {
      const charge = await seed({ paymentUrlExpiresAt: past() });
      const paid = await stored(charge);
      paid.markPaid('PIX', h.clock.now(), null, 'corr', null);
      await h.charges.save(paid);

      await expect(link(charge)).resolves.toEqual({
        status: 'PAID',
        paymentUrl: null,
        expiresAt: null,
      });

      expect(regenerate).not.toHaveBeenCalled();
    });

    // `FAILED` is unreachable in M26 and payable by design (a fresh link starts a new provider
    // attempt), so the use case path is pinned here and M29 needs no change.
    it.each(['PENDING', 'OVERDUE', 'FAILED'] as const)('a %s charge is payable', async (status) => {
      const charge = await seed({ status, paymentUrlExpiresAt: future() });

      await expect(link(charge)).resolves.toMatchObject({ status });
    });
  });

  describe('a stored link that is still usable', () => {
    it('is returned as it is, with no provider call (the provider gave an expiry still ahead)', async () => {
      const expiresAt = future();
      const charge = await seed({ paymentUrlExpiresAt: expiresAt });

      await expect(link(charge)).resolves.toEqual({
        status: 'PENDING',
        paymentUrl: charge.paymentUrl,
        expiresAt: expiresAt.toISOString(),
      });

      expect(regenerate).not.toHaveBeenCalled();
    });

    it('is returned as it is when the provider gave no expiry, and the answer does not invent one', async () => {
      const charge = await seed({ paymentUrlExpiresAt: null });

      await expect(link(charge)).resolves.toEqual({
        status: 'PENDING',
        paymentUrl: charge.paymentUrl,
        expiresAt: null,
      });

      expect(regenerate).not.toHaveBeenCalled();
    });
  });

  describe('an expired link (A1)', () => {
    it('is regenerated at the provider, stored and returned', async () => {
      const charge = await seed({ paymentUrlExpiresAt: past() });

      const answer = await link(charge);

      expect(regenerate).toHaveBeenCalledWith(charge.providerChargeId);
      const expiresAt = new Date(h.clock.now().getTime() + LINK_TTL_MS);
      expect(answer).toEqual({
        status: 'PENDING',
        paymentUrl: expect.any(String),
        expiresAt: expiresAt.toISOString(),
      });
      const after = await stored(charge);
      expect(after.paymentUrl).toBe(answer.paymentUrl);
      expect(after.paymentUrlExpiresAt).toEqual(expiresAt);
      expect(after.status).toBe('PENDING');
    });

    it('is regenerated for the recovery charge of a suspended tenant too', async () => {
      const charge = await seed({ kind: 'RECOVERY', paymentUrlExpiresAt: past() });

      await expect(link(charge)).resolves.toMatchObject({ status: 'PENDING' });

      expect(regenerate).toHaveBeenCalledTimes(1);
    });

    it.each(['UNAVAILABLE', 'LINK_EXPIRED'] as const)(
      'a provider failure (%s) is the retryable "unavailable" and stores nothing',
      async (reason) => {
        const expired = past();
        const charge = await seed({ paymentUrlExpiresAt: expired });
        h.provider.failNextCall(reason);

        await expect(link(charge)).rejects.toThrow(BillingProviderUnavailableError);

        expect((await stored(charge)).paymentUrlExpiresAt).toEqual(expired);
      },
    );

    it('a merchant profile no adapter serves yet is not served, and the provider is not asked (the mapper makes it a 503)', async () => {
      const sandbox = new ChargeBuilder()
        .withTenantId(subscription.tenantId)
        .withSubscriptionId(subscription.id)
        .withMerchantProfileKey('BRL_ASAAS_SANDBOX')
        .withProviderReady('ASAAS', 'pay_sandbox')
        .withPaymentUrlExpiresAt(past())
        .build();
      await h.charges.save(sandbox);

      await expect(link(sandbox)).rejects.toThrow(ProviderNotSupportedError);

      expect(regenerate).not.toHaveBeenCalled();
    });
  });

  describe('a charge the provider does not hold yet', () => {
    it('is held for the billing address when the identity is incomplete (the sweep’s recovery charge)', async () => {
      const heldSubscription = new SubscriptionBuilder()
        .withStatus('SUSPENDED')
        .withItems([h.hotsiteItem()])
        .build();
      await h.seedTenant(heldSubscription, { billable: false });
      const held = await h.seedCharge(heldSubscription, {
        kind: 'RECOVERY',
        dueDate: '2026-03-10',
        ready: false,
      });

      await expect(link(held)).rejects.toThrow(BillingAddressRequiredError);

      expect(regenerate).not.toHaveBeenCalled();
    });

    it('is a provider outage when the identity is billable: the creation retry makes it', async () => {
      const charge = await seed({ ready: false });

      await expect(link(charge)).rejects.toThrow(BillingProviderUnavailableError);

      expect(regenerate).not.toHaveBeenCalled();
    });
  });

  describe('the charge changed while the provider call was in flight', () => {
    const settleDuringCall = (change: (charge: Charge) => void, charge: Charge) =>
      regenerate.mockImplementationOnce(async (providerChargeId: string) => {
        const current = await stored(charge);
        change(current);
        await h.charges.save(current);
        return {
          paymentUrl: `https://pay.example/${providerChargeId}/renewed`,
          expiresAt: new Date(h.clock.now().getTime() + LINK_TTL_MS),
        };
      });

    it('a webhook that paid it is never overwritten: the link is stored and the answer is the paid state', async () => {
      const charge = await seed({ paymentUrlExpiresAt: past() });
      settleDuringCall((c) => c.markPaid('PIX', h.clock.now(), null, 'corr', null), charge);

      await expect(link(charge)).resolves.toEqual({
        status: 'PAID',
        paymentUrl: null,
        expiresAt: null,
      });

      const after = await stored(charge);
      expect(after.status).toBe('PAID');
      expect(after.paymentUrl).toBe(`https://pay.example/${charge.providerChargeId}/renewed`);
    });

    it('a cancel in between is refused as not payable, with the link still stored', async () => {
      const charge = await seed({ paymentUrlExpiresAt: past() });
      settleDuringCall((c) => c.cancel(), charge);

      await expect(link(charge)).rejects.toThrow(ChargeNotPayableError);

      expect((await stored(charge)).paymentUrl).toBe(
        `https://pay.example/${charge.providerChargeId}/renewed`,
      );
    });
  });
});
