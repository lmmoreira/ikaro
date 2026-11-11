import { FixedClock } from '../../../../test/infrastructure/fixed-clock';
import type { CreateProviderChargeInput } from '../../application/ports/billing-provider.port';
import {
  ChargeAlreadyPaidError,
  ProviderRequestError,
} from '../../domain/errors/billing-provider.errors';
import { FAKE_WEBHOOK_TOKEN } from './fake-asaas-webhook.emitter';
import { FakeBillingProvider } from './fake-billing.provider';
import { applyDeliveryOptions, type FakeWebhookDelivery } from './fake-billing.types';

const NOW = new Date('2026-11-11T12:00:00.000Z');
const IDENTITY = { name: 'Lava Rápido', email: 'a@example.com', taxId: null, countryCode: 'BR' };

function setup(): { fake: FakeBillingProvider; clock: FixedClock } {
  const clock = new FixedClock(NOW);
  return { fake: new FakeBillingProvider(clock), clock };
}

function input(
  providerCustomerId: string,
  overrides: Partial<CreateProviderChargeInput> = {},
): CreateProviderChargeInput {
  return {
    merchantProfileKey: 'BRL_FAKE',
    providerCustomerId,
    dueDate: '2026-12-10',
    lines: [{ description: 'Hotsite', amountMinor: 4900 }],
    currency: 'BRL',
    taxBehavior: 'INCLUSIVE',
    customerLocation: { countryCode: 'BR' },
    description: 'Assinatura',
    externalReference: 'ref-1',
    returnUrl: 'https://app.example.com/billing',
    ...overrides,
  };
}

async function charge(fake: FakeBillingProvider): Promise<string> {
  const { providerCustomerId } = await fake.ensureCustomer('tenant-1', IDENTITY);
  return (await fake.createCharge(input(providerCustomerId))).providerChargeId;
}

describe('FakeBillingProvider', () => {
  describe('charge creation', () => {
    it.each([
      [499, false],
      [500, true],
    ])(
      'enforces the R$ 5,00 minimum (%i minor units accepted: %s)',
      async (amountMinor, accepted) => {
        const { fake } = setup();
        const { providerCustomerId } = await fake.ensureCustomer('tenant-1', IDENTITY);

        const attempt = fake.createCharge(
          input(providerCustomerId, { lines: [{ description: 'x', amountMinor }] }),
        );

        if (accepted) await expect(attempt).resolves.toMatchObject({ totalMinor: amountMinor });
        else await expect(attempt).rejects.toMatchObject({ reason: 'INVALID_AMOUNT' });
      },
    );

    it('sums several lines into the total', async () => {
      const { fake } = setup();
      const { providerCustomerId } = await fake.ensureCustomer('tenant-1', IDENTITY);

      const created = await fake.createCharge(
        input(providerCustomerId, {
          lines: [
            { description: 'Hotsite', amountMinor: 4900 },
            { description: 'Chatbot', amountMinor: 3900 },
          ],
        }),
      );

      expect(created.totalMinor).toBe(8800);
    });

    it('rejects a fractional amount', async () => {
      const { fake } = setup();
      const { providerCustomerId } = await fake.ensureCustomer('tenant-1', IDENTITY);

      await expect(
        fake.createCharge(
          input(providerCustomerId, { lines: [{ description: 'x', amountMinor: 1000.5 }] }),
        ),
      ).rejects.toMatchObject({ reason: 'INVALID_AMOUNT' });
    });

    it('rejects an unknown customer and an unknown charge with NOT_FOUND', async () => {
      const { fake } = setup();

      await expect(fake.createCharge(input('cus_missing'))).rejects.toMatchObject({
        reason: 'NOT_FOUND',
      });
      await expect(fake.fetchChargeStatus('pay_missing')).rejects.toMatchObject({
        reason: 'NOT_FOUND',
      });
    });

    it('expires the link seven days after the clock', async () => {
      const { fake } = setup();
      const { providerCustomerId } = await fake.ensureCustomer('tenant-1', IDENTITY);

      const created = await fake.createCharge(input(providerCustomerId));

      expect(created.expiresAt.toISOString()).toBe('2026-11-18T12:00:00.000Z');
    });
  });

  describe('webhook deliveries', () => {
    it('queues a PAYMENT_CREATED that normalises to Ignored', async () => {
      const { fake } = setup();
      await charge(fake);

      const [delivery] = fake.drainDeliveries();

      expect(fake.parseWebhook(delivery.body, delivery.headers).type).toBe('Ignored');
    });

    it('sends the headers Asaas sends, and parseWebhook never checks the token', async () => {
      const { fake } = setup();
      await charge(fake);
      const [delivery] = fake.drainDeliveries();

      expect(delivery.headers['asaas-access-token']).toBe(FAKE_WEBHOOK_TOKEN);
      expect(delivery.headers['content-type']).toBe('application/json');
      expect(() =>
        fake.parseWebhook(delivery.body, { 'asaas-access-token': 'a-wrong-token' }),
      ).not.toThrow();
    });

    it('writes dateCreated in São Paulo local time, which reads back as the clock instant', async () => {
      const { fake } = setup();
      await charge(fake);
      const [delivery] = fake.drainDeliveries();

      expect(JSON.parse(delivery.body).dateCreated).toBe('2026-11-11 09:00:00');
      expect(fake.parseWebhook(delivery.body, delivery.headers).occurredAt).toEqual(NOW);
    });

    it('numbers event ids upward, and repeats the hex part for events of one type', async () => {
      const { fake } = setup();
      const { providerCustomerId } = await fake.ensureCustomer('tenant-1', IDENTITY);
      await fake.createCharge(input(providerCustomerId, { externalReference: 'ref-a' }));
      const second = await fake.createCharge(
        input(providerCustomerId, { externalReference: 'ref-b' }),
      );
      fake.simulatePayment(second.providerChargeId, 'PIX');

      const ids = fake.drainDeliveries().map((delivery) => JSON.parse(delivery.body).id as string);

      expect(ids).toHaveLength(3);
      for (const eventId of ids) expect(eventId).toMatch(/^evt_[0-9a-f]{32}&\d+$/);
      expect(ids.map((eventId) => Number(eventId.split('&')[1]))).toEqual([1, 2, 3]);
      expect(ids[0].split('&')[0]).toBe(ids[1].split('&')[0]);
      expect(ids[2].split('&')[0]).not.toBe(ids[0].split('&')[0]);
    });

    it('queues PAYMENT_DELETED when a charge is cancelled', async () => {
      const { fake } = setup();
      const id = await charge(fake);
      fake.drainDeliveries();

      await fake.cancelCharge(id);

      const events = fake
        .drainDeliveries()
        .map((delivery) => fake.parseWebhook(delivery.body, delivery.headers));
      expect(events.map((event) => event.type)).toEqual(['PaymentCancelled']);
    });

    it('clears the queue once it is drained', async () => {
      const { fake } = setup();
      await charge(fake);

      fake.drainDeliveries();

      expect(fake.drainDeliveries()).toEqual([]);
    });
  });

  describe('cancelling', () => {
    it.each(['refund', 'chargeback'] as const)(
      'refuses to cancel a charge that was paid then %s',
      async (action) => {
        const { fake } = setup();
        const id = await charge(fake);
        fake.simulatePayment(id, 'CREDIT_CARD');
        if (action === 'refund') fake.simulateRefund(id, 'FULL');
        else fake.simulateChargeback(id);

        await expect(fake.cancelCharge(id)).rejects.toBeInstanceOf(ChargeAlreadyPaidError);
      },
    );

    it('cancels an overdue charge', async () => {
      const { fake } = setup();
      const id = await charge(fake);
      fake.simulateOverdue(id);

      await fake.cancelCharge(id);

      expect((await fake.fetchChargeStatus(id)).state).toBe('CANCELLED');
    });
  });

  describe('scenario controls', () => {
    it.each([
      [
        'pay a cancelled charge',
        async (fake: FakeBillingProvider, id: string) => {
          await fake.cancelCharge(id);
          fake.simulatePayment(id, 'PIX');
        },
      ],
      [
        'pay a paid charge',
        async (fake: FakeBillingProvider, id: string) => {
          fake.simulatePayment(id, 'PIX');
          fake.simulatePayment(id, 'PIX');
        },
      ],
      [
        'refund an unpaid charge',
        async (fake: FakeBillingProvider, id: string) => {
          fake.simulateRefund(id, 'FULL');
        },
      ],
      [
        'mark a paid charge overdue',
        async (fake: FakeBillingProvider, id: string) => {
          fake.simulatePayment(id, 'PIX');
          fake.simulateOverdue(id);
        },
      ],
      [
        'settle a card that was never paid',
        async (fake: FakeBillingProvider, id: string) => {
          fake.simulateCardSettlement(id);
        },
      ],
      [
        'charge back an unpaid charge',
        async (fake: FakeBillingProvider, id: string) => {
          fake.simulateChargeback(id);
        },
      ],
    ])('refuses to %s', async (_label, act) => {
      const { fake } = setup();
      const id = await charge(fake);

      await expect(act(fake, id)).rejects.toThrow(/The fake cannot/);
    });

    it('fails exactly one call and then recovers', async () => {
      const { fake } = setup();
      fake.failNextCall('UNAVAILABLE');

      await expect(fake.ensureCustomer('tenant-1', IDENTITY)).rejects.toBeInstanceOf(
        ProviderRequestError,
      );
      await expect(fake.ensureCustomer('tenant-1', IDENTITY)).resolves.toBeDefined();
    });

    it('lets a paid Pix charge be paid after it went overdue', async () => {
      const { fake } = setup();
      const id = await charge(fake);
      fake.simulateOverdue(id);

      fake.simulatePayment(id, 'PIX');

      expect((await fake.fetchChargeStatus(id)).state).toBe('PAID');
    });

    it('tracks automatic billing per customer', async () => {
      const { fake } = setup();
      const { providerCustomerId } = await fake.ensureCustomer('tenant-1', IDENTITY);

      await fake.startAutoBilling(providerCustomerId, 'CARD_RECURRING');
      expect(fake.hasAutoBilling(providerCustomerId)).toBe(true);
      await fake.revokeAutoBilling(providerCustomerId);

      expect(fake.hasAutoBilling(providerCustomerId)).toBe(false);
      await expect(fake.startAutoBilling('cus_missing', 'PIX_AUTOMATICO')).rejects.toMatchObject({
        reason: 'NOT_FOUND',
      });
    });
  });
});

describe('applyDeliveryOptions', () => {
  const deliveries: FakeWebhookDelivery[] = ['a', 'b'].map((body) => ({
    body,
    headers: {},
    delayMs: 0,
  }));

  it('passes deliveries through untouched by default', () => {
    expect(applyDeliveryOptions(deliveries, {})).toEqual(deliveries);
  });

  it('reverses, duplicates and delays', () => {
    const result = applyDeliveryOptions(deliveries, {
      reverse: true,
      duplicate: true,
      delayMs: 30,
    });

    expect(result.map((delivery) => delivery.body)).toEqual(['b', 'b', 'a', 'a']);
    expect(result.every((delivery) => delivery.delayMs === 30)).toBe(true);
  });

  it('does not mutate the input', () => {
    applyDeliveryOptions(deliveries, { reverse: true });

    expect(deliveries.map((delivery) => delivery.body)).toEqual(['a', 'b']);
  });
});
