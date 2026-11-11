import { addDaysUTC, todayInTimezone } from '../../shared/utils/calendar-date';
import type {
  BillingProviderPort,
  CreateProviderChargeInput,
} from '../../contexts/billing/application/ports/billing-provider.port';
import {
  ChargeAlreadyPaidError,
  InvalidProviderWebhookError,
  ProviderRequestError,
  type ProviderRequestFailure,
} from '../../contexts/billing/domain/errors/billing-provider.errors';
import type {
  NormalizedProviderEvent,
  PaymentMethod,
} from '../../contexts/billing/domain/provider-events';

export interface ContractDelivery {
  readonly body: string;
  readonly headers: Readonly<Record<string, string>>;
  readonly delayMs: number;
}

export interface DeliveryMisbehaviour {
  readonly duplicate?: boolean;
  readonly reverse?: boolean;
  readonly delayMs?: number;
}

/** What a provider can be driven to do. The Asaas sandbox cannot make a charge overdue, refund a boleto or charge back (docs/ASAAS_PROVIDER.md § 5), so those run on the fake only. */
export interface ContractScenarios {
  pay(providerChargeId: string, method: PaymentMethod): Promise<void>;
  settleCard(providerChargeId: string): Promise<void>;
  overdue(providerChargeId: string): Promise<void>;
  refund(providerChargeId: string, kind: 'FULL' | 'PARTIAL'): Promise<void>;
  chargeback(providerChargeId: string): Promise<void>;
  failNextCall(reason: ProviderRequestFailure): void;
  pauseWebhookQueue(): void;
  /** Hands out the webhooks produced since the last call, in the provider's own wire format. */
  drain(misbehaviour?: DeliveryMisbehaviour): Promise<ContractDelivery[]>;
  /** A well-formed webhook of an event type the normaliser does not handle. */
  unknownEventBody(): string;
}

export interface BillingProviderContractHarness {
  readonly provider: BillingProviderPort;
  readonly merchantProfileKey: string;
  readonly scenarios: Partial<ContractScenarios>;
  now(): Date;
}

export interface ContractCapabilities {
  readonly methodSequences: boolean;
  readonly overdue: boolean;
  readonly refund: boolean;
  readonly chargeback: boolean;
  readonly deliveryControl: boolean;
  readonly queuePause: boolean;
  readonly autoBilling: boolean;
}

const TENANT_ID = '10000000-0000-4000-8000-000000000001';
const IDENTITY = {
  name: 'Lava Rápido Ltda',
  email: 'contato@example.com',
  taxId: '11222333000181',
  countryCode: 'BR',
};
const METHODS: readonly PaymentMethod[] = ['PIX', 'BOLETO', 'CARD'];
const BRAZIL_ZONE = 'America/Sao_Paulo';

let referenceCounter = 0;

/** A Brazilian calendar day relative to the harness clock: a provider refuses a due date in the past, so a fixed date would start failing on the day it passes. */
function dueDateIn(harness: BillingProviderContractHarness, days: number): string {
  return addDaysUTC(todayInTimezone(BRAZIL_ZONE, harness.now()), days);
}

function chargeInput(
  harness: BillingProviderContractHarness,
  providerCustomerId: string,
  overrides: Partial<CreateProviderChargeInput> = {},
): CreateProviderChargeInput {
  referenceCounter += 1;
  return {
    merchantProfileKey: harness.merchantProfileKey,
    providerCustomerId,
    dueDate: dueDateIn(harness, 30),
    lines: [{ description: 'Hotsite', amountMinor: 4900 }],
    currency: 'BRL',
    taxBehavior: 'INCLUSIVE',
    customerLocation: { countryCode: 'BR' },
    description: 'Assinatura Ikaro',
    externalReference: `contract-charge-${referenceCounter}`,
    returnUrl: 'https://app.example.com/dashboard/billing',
    ...overrides,
  };
}

async function newCharge(
  harness: BillingProviderContractHarness,
): Promise<{ providerChargeId: string; providerCustomerId: string }> {
  const { providerCustomerId } = await harness.provider.ensureCustomer(TENANT_ID, IDENTITY);
  const created = await harness.provider.createCharge(chargeInput(harness, providerCustomerId));
  return { providerChargeId: created.providerChargeId, providerCustomerId };
}

function scenario<K extends keyof ContractScenarios>(
  harness: BillingProviderContractHarness,
  name: K,
): ContractScenarios[K] {
  const found = harness.scenarios[name];
  if (!found) throw new Error(`The harness does not provide the "${name}" scenario`);
  return found;
}

function parse(
  harness: BillingProviderContractHarness,
  deliveries: readonly ContractDelivery[],
): NormalizedProviderEvent[] {
  return deliveries.map((delivery) =>
    harness.provider.parseWebhook(delivery.body, delivery.headers),
  );
}

async function drainEvents(
  harness: BillingProviderContractHarness,
  misbehaviour?: DeliveryMisbehaviour,
): Promise<NormalizedProviderEvent[]> {
  const deliveries = await scenario(harness, 'drain')(misbehaviour);
  return parse(harness, deliveries).filter((event) => event.type !== 'Ignored');
}

function registerCoreCases(
  create: () => BillingProviderContractHarness | Promise<BillingProviderContractHarness>,
): void {
  it('creates a customer once per tenant', async () => {
    const { provider } = await create();

    const first = await provider.ensureCustomer(TENANT_ID, IDENTITY);
    const again = await provider.ensureCustomer(TENANT_ID, IDENTITY);
    const other = await provider.ensureCustomer('10000000-0000-4000-8000-000000000002', IDENTITY);

    expect(again.providerCustomerId).toBe(first.providerCustomerId);
    expect(other.providerCustomerId).not.toBe(first.providerCustomerId);
  });

  it('creates a charge with a hosted payment link', async () => {
    const harness = await create();
    const { providerCustomerId } = await harness.provider.ensureCustomer(TENANT_ID, IDENTITY);

    const created = await harness.provider.createCharge(chargeInput(harness, providerCustomerId));

    expect(created.paymentUrl).toMatch(/^https?:\/\//);
    expect(created.expiresAt.getTime()).toBeGreaterThan(harness.now().getTime());
    expect(created.totalMinor).toBe(4900);
    expect(created.tax.totalTaxMinor).toBe(0);
    const status = await harness.provider.fetchChargeStatus(created.providerChargeId);
    expect(status).toMatchObject({ state: 'PENDING', paidAt: null, receiptUrl: null });
  });

  it('returns the same charge when created twice with one external reference', async () => {
    const harness = await create();
    const { providerCustomerId } = await harness.provider.ensureCustomer(TENANT_ID, IDENTITY);
    const input = chargeInput(harness, providerCustomerId);

    const first = await harness.provider.createCharge(input);
    const again = await harness.provider.createCharge(input);

    expect(again.providerChargeId).toBe(first.providerChargeId);
  });

  it('rejects a charge for a customer location that is not valid', async () => {
    const harness = await create();
    const { providerCustomerId } = await harness.provider.ensureCustomer(TENANT_ID, IDENTITY);

    const attempt = harness.provider.createCharge(
      chargeInput(harness, providerCustomerId, { customerLocation: { countryCode: '' } }),
    );

    await expect(attempt).rejects.toMatchObject({ reason: 'INVALID_LOCATION' });
  });

  it('rejects a new charge due before today and accepts one due today', async () => {
    const harness = await create();
    const { providerCustomerId } = await harness.provider.ensureCustomer(TENANT_ID, IDENTITY);

    const yesterday = harness.provider.createCharge(
      chargeInput(harness, providerCustomerId, { dueDate: dueDateIn(harness, -1) }),
    );
    const today = harness.provider.createCharge(
      chargeInput(harness, providerCustomerId, { dueDate: dueDateIn(harness, 0) }),
    );

    await expect(yesterday).rejects.toMatchObject({ reason: 'INVALID_DUE_DATE' });
    await expect(today).resolves.toBeDefined();
  });

  it('rejects a charge for a customer that has no tax id', async () => {
    const harness = await create();
    const { providerCustomerId } = await harness.provider.ensureCustomer(
      '10000000-0000-4000-8000-000000000003',
      { ...IDENTITY, taxId: null },
    );

    const attempt = harness.provider.createCharge(chargeInput(harness, providerCustomerId));

    await expect(attempt).rejects.toMatchObject({ reason: 'TAX_ID_REQUIRED' });
  });

  it('regenerates the payment link', async () => {
    const harness = await create();
    const { providerChargeId } = await newCharge(harness);

    const link = await harness.provider.regeneratePaymentLink(providerChargeId);

    expect(link.paymentUrl).toMatch(/^https?:\/\//);
    expect(link.expiresAt.getTime()).toBeGreaterThan(harness.now().getTime());
  });

  it('cancels a pending charge, and cancelling again does not fail', async () => {
    const harness = await create();
    const { providerChargeId } = await newCharge(harness);

    await harness.provider.cancelCharge(providerChargeId);
    await harness.provider.cancelCharge(providerChargeId);

    expect((await harness.provider.fetchChargeStatus(providerChargeId)).state).toBe('CANCELLED');
  });

  it('refuses to cancel a paid charge with ChargeAlreadyPaidError', async () => {
    const harness = await create();
    const { providerChargeId } = await newCharge(harness);
    await scenario(harness, 'pay')(providerChargeId, 'PIX');

    await expect(harness.provider.cancelCharge(providerChargeId)).rejects.toBeInstanceOf(
      ChargeAlreadyPaidError,
    );
  });

  it('reads an unknown body as an invalid webhook', async () => {
    const { provider } = await create();

    expect(() => provider.parseWebhook('not json', {})).toThrow(InvalidProviderWebhookError);
  });

  it('normalises an event type it does not handle to Ignored', async () => {
    const harness = await create();

    const event = harness.provider.parseWebhook(scenario(harness, 'unknownEventBody')(), {});

    expect(event.type).toBe('Ignored');
  });

  it('normalises the same webhook body to the same event every time', async () => {
    const harness = await create();
    const { providerChargeId } = await newCharge(harness);
    await scenario(harness, 'pay')(providerChargeId, 'PIX');
    const [delivery] = (await scenario(harness, 'drain')()).slice(-1);

    const first = harness.provider.parseWebhook(delivery.body, delivery.headers);
    const again = harness.provider.parseWebhook(delivery.body, delivery.headers);

    expect(again).toEqual(first);
    expect(first.type).toBe('PaymentConfirmed');
  });
}

function registerPaymentCases(
  create: () => BillingProviderContractHarness | Promise<BillingProviderContractHarness>,
): void {
  it.each(METHODS)('records a %s payment as paid with its method and receipt', async (method) => {
    const harness = await create();
    const { providerChargeId } = await newCharge(harness);

    await scenario(harness, 'pay')(providerChargeId, method);

    expect(await harness.provider.fetchChargeStatus(providerChargeId)).toMatchObject({
      state: 'PAID',
      paymentMethod: method,
    });
    const status = await harness.provider.fetchChargeStatus(providerChargeId);
    expect(status.paidAt).toBeInstanceOf(Date);
    expect(status.receiptUrl).toMatch(/^https?:\/\//);
  });
}

function registerSequenceCases(
  create: () => BillingProviderContractHarness | Promise<BillingProviderContractHarness>,
): void {
  it('emits only RECEIVED for a Pix payment', async () => {
    const harness = await create();
    const { providerChargeId } = await newCharge(harness);
    await scenario(harness, 'pay')(providerChargeId, 'PIX');

    const events = await drainEvents(harness);

    expect(events.map((event) => event.type)).toEqual(['PaymentConfirmed']);
  });

  it('emits CONFIRMED then RECEIVED for a boleto, both normalised as the paid signal', async () => {
    const harness = await create();
    const { providerChargeId } = await newCharge(harness);
    await scenario(harness, 'pay')(providerChargeId, 'BOLETO');

    const events = await drainEvents(harness);

    expect(events.map((event) => event.type)).toEqual(['PaymentConfirmed', 'PaymentConfirmed']);
    expect(new Set(events.map((event) => event.providerEventId)).size).toBe(2);
  });

  it('emits CONFIRMED for a card now and RECEIVED only when it settles', async () => {
    const harness = await create();
    const { providerChargeId } = await newCharge(harness);
    await scenario(harness, 'pay')(providerChargeId, 'CARD');
    const atPayment = await drainEvents(harness);

    await scenario(harness, 'settleCard')(providerChargeId);
    const atSettlement = await drainEvents(harness);

    expect(atPayment.map((event) => event.type)).toEqual(['PaymentConfirmed']);
    expect(atSettlement.map((event) => event.type)).toEqual(['PaymentConfirmed']);
  });
}

function registerLifecycleCases(
  create: () => BillingProviderContractHarness | Promise<BillingProviderContractHarness>,
  capabilities: ContractCapabilities,
): void {
  if (capabilities.overdue) {
    it('marks an unpaid charge overdue', async () => {
      const harness = await create();
      const { providerChargeId } = await newCharge(harness);

      await scenario(harness, 'overdue')(providerChargeId);

      expect((await harness.provider.fetchChargeStatus(providerChargeId)).state).toBe('OVERDUE');
      expect((await drainEvents(harness)).map((event) => event.type)).toEqual(['PaymentOverdue']);
    });
  }
  if (capabilities.refund) {
    it.each([
      ['FULL', 'REFUNDED', 'PaymentRefunded'],
      ['PARTIAL', 'PARTIALLY_REFUNDED', 'PaymentPartiallyRefunded'],
    ] as const)('refunds a paid charge (%s)', async (kind, state, eventType) => {
      const harness = await create();
      const { providerChargeId } = await newCharge(harness);
      await scenario(harness, 'pay')(providerChargeId, 'CARD');
      await drainEvents(harness);

      await scenario(harness, 'refund')(providerChargeId, kind);

      expect((await harness.provider.fetchChargeStatus(providerChargeId)).state).toBe(state);
      expect((await drainEvents(harness)).map((event) => event.type)).toEqual([eventType]);
    });
  }
  if (capabilities.chargeback) {
    it('opens a chargeback on a paid charge', async () => {
      const harness = await create();
      const { providerChargeId } = await newCharge(harness);
      await scenario(harness, 'pay')(providerChargeId, 'CARD');
      await drainEvents(harness);

      await scenario(harness, 'chargeback')(providerChargeId);

      expect((await drainEvents(harness)).map((event) => event.type)).toEqual([
        'PaymentChargeback',
      ]);
    });
  }
}

function registerDeliveryCases(
  create: () => BillingProviderContractHarness | Promise<BillingProviderContractHarness>,
): void {
  it('delivers a duplicate with the same event id', async () => {
    const harness = await create();
    const { providerChargeId } = await newCharge(harness);
    await scenario(harness, 'pay')(providerChargeId, 'PIX');

    const events = await drainEvents(harness, { duplicate: true });

    expect(events).toHaveLength(2);
    expect(events[1]).toEqual(events[0]);
  });

  it('delivers out of order and every webhook still reads', async () => {
    const harness = await create();
    const { providerChargeId } = await newCharge(harness);
    await scenario(harness, 'pay')(providerChargeId, 'BOLETO');
    await scenario(harness, 'refund')(providerChargeId, 'FULL');

    const events = await drainEvents(harness, { reverse: true });

    expect(events.map((event) => event.type)).toEqual([
      'PaymentRefunded',
      'PaymentConfirmed',
      'PaymentConfirmed',
    ]);
  });

  it('holds a delivery back by the requested delay', async () => {
    const harness = await create();
    await newCharge(harness);

    const deliveries = await scenario(harness, 'drain')({ delayMs: 5000 });

    expect(deliveries.length).toBeGreaterThan(0);
    expect(deliveries.every((delivery) => delivery.delayMs === 5000)).toBe(true);
  });

  it.each(['UNAVAILABLE', 'LINK_EXPIRED'] as const)(
    'fails the next call once with %s',
    async (reason) => {
      const harness = await create();
      const { providerChargeId } = await newCharge(harness);
      scenario(harness, 'failNextCall')(reason);

      await expect(harness.provider.regeneratePaymentLink(providerChargeId)).rejects.toThrow(
        ProviderRequestError,
      );
      await expect(harness.provider.regeneratePaymentLink(providerChargeId)).resolves.toBeDefined();
    },
  );
}

function registerHealthAndAutoBillingCases(
  create: () => BillingProviderContractHarness | Promise<BillingProviderContractHarness>,
  capabilities: ContractCapabilities,
): void {
  if (capabilities.queuePause) {
    it('reports a paused webhook queue and recovers it', async () => {
      const harness = await create();
      expect(await harness.provider.readAccountHealth(harness.merchantProfileKey)).toEqual({
        webhookStatus: 'OK',
        queuePaused: false,
      });

      scenario(harness, 'pauseWebhookQueue')();
      expect(await harness.provider.readAccountHealth(harness.merchantProfileKey)).toEqual({
        webhookStatus: 'PAUSED',
        queuePaused: true,
      });

      await harness.provider.reenableWebhookQueue(harness.merchantProfileKey);
      expect(
        (await harness.provider.readAccountHealth(harness.merchantProfileKey)).webhookStatus,
      ).toBe('OK');
    });
  }
  if (capabilities.autoBilling) {
    it('starts and revokes automatic billing', async () => {
      const harness = await create();
      const { providerCustomerId } = await harness.provider.ensureCustomer(TENANT_ID, IDENTITY);

      const started = await harness.provider.startAutoBilling(providerCustomerId, 'PIX_AUTOMATICO');

      expect(started.authorizationUrl).toMatch(/^https?:\/\//);
      await expect(harness.provider.revokeAutoBilling(providerCustomerId)).resolves.toBeUndefined();
    });
  }
}

/**
 * The provider-agnostic behaviour of `BillingProviderPort`. It runs against the fake on every PR
 * and, from M26-S37, against the Asaas sandbox nightly; a case only the fake can produce is gated
 * by a capability the sandbox runner leaves off. A change to the port changes this suite first.
 */
export function runBillingProviderContract(
  name: string,
  create: () => BillingProviderContractHarness | Promise<BillingProviderContractHarness>,
  capabilities: ContractCapabilities,
): void {
  describe(`BillingProviderPort contract: ${name}`, () => {
    registerCoreCases(create);
    registerPaymentCases(create);
    if (capabilities.methodSequences) registerSequenceCases(create);
    registerLifecycleCases(create, capabilities);
    if (capabilities.deliveryControl) registerDeliveryCases(create);
    registerHealthAndAutoBillingCases(create, capabilities);
  });
}
