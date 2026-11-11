import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { todayInTimezone } from '../../../../shared/utils/calendar-date';
import { CLOCK, type IClock } from '../../../../shared/ports/clock.port';
import type {
  BillingProviderPort,
  CreateProviderChargeInput,
  CreatedProviderCharge,
  ProviderCustomerIdentity,
  ProviderPaymentLink,
  WebhookHeaders,
} from '../../application/ports/billing-provider.port';
import {
  ChargeAlreadyPaidError,
  ProviderRequestError,
  type ProviderRequestFailure,
} from '../../domain/errors/billing-provider.errors';
import type {
  AutoBillingMode,
  NormalizedChargeStatus,
  NormalizedProviderEvent,
  PaymentMethod,
  ProviderAccountHealth,
} from '../../domain/provider-events';
import { ASAAS_ZONE, normalizeAsaasWebhook } from './asaas-event-normalizer';
import { FakeAsaasWebhookEmitter } from './fake-asaas-webhook.emitter';
import { assertValidNewCharge } from './fake-charge-rules';
import {
  applyDeliveryOptions,
  type DeliveryOptions,
  receiptUrlOf,
  type FakeCharge,
  type FakeWebhookDelivery,
} from './fake-billing.types';

const FAKE_PAYMENT_URL_BASE = 'https://fake-billing.invalid/i';
const LINK_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const PAID_STATES: ReadonlyArray<FakeCharge['state']> = ['PAID', 'PARTIALLY_REFUNDED'];

/**
 * The in-process provider behind `BRL_FAKE`. It is a real adapter, not a `jest.fn()` stub, and as
 * strict as the provider it stands in for (the R$ 5 minimum, one paid signal per method, a cancel
 * of a paid charge refused). Charges live in memory per process. Webhooks are queued by the port
 * calls and the `simulate*` controls, then handed out by `drainDeliveries`.
 */
@Injectable()
export class FakeBillingProvider implements BillingProviderPort {
  private readonly customerByTenant = new Map<string, string>();
  private readonly identityByCustomer = new Map<string, ProviderCustomerIdentity>();
  private readonly charges = new Map<string, FakeCharge>();
  private readonly autoBillingCustomers = new Set<string>();
  private readonly emitter: FakeAsaasWebhookEmitter;
  private pending: FakeWebhookDelivery[] = [];
  private nextFailure: ProviderRequestFailure | null = null;
  private queuePaused = false;

  constructor(@Inject(CLOCK) private readonly clock: IClock) {
    this.emitter = new FakeAsaasWebhookEmitter(clock);
  }

  /** Creates the provider customer, or updates the identity of the one this tenant already has. */
  async ensureCustomer(
    tenantId: string,
    identity: ProviderCustomerIdentity,
  ): Promise<{ providerCustomerId: string }> {
    this.consumeFailure();
    const providerCustomerId = this.customerByTenant.get(tenantId) ?? this.newId('cus');
    this.customerByTenant.set(tenantId, providerCustomerId);
    this.identityByCustomer.set(providerCustomerId, identity);
    return { providerCustomerId };
  }

  async createCharge(input: CreateProviderChargeInput): Promise<CreatedProviderCharge> {
    this.consumeFailure();
    this.assertCustomer(input.providerCustomerId);
    const charge = this.findByReference(input.externalReference) ?? this.insertNewCharge(input);
    return {
      ...this.linkOf(charge),
      providerChargeId: charge.id,
      totalMinor: charge.amountMinor,
      tax: { totalTaxMinor: 0, lines: [] },
    };
  }

  async regeneratePaymentLink(providerChargeId: string): Promise<ProviderPaymentLink> {
    this.consumeFailure();
    return this.linkOf(this.chargeOrThrow(providerChargeId));
  }

  async cancelCharge(providerChargeId: string): Promise<void> {
    this.consumeFailure();
    const charge = this.chargeOrThrow(providerChargeId);
    if (charge.state === 'CANCELED') return;
    // Only a charge that is paid (even partly refunded) is "the payment" a caller must honour. A
    // refunded or charged-back one is refused too, but it must never read as a payment.
    if (PAID_STATES.includes(charge.state)) throw new ChargeAlreadyPaidError(providerChargeId);
    if (charge.state !== 'PENDING' && charge.state !== 'OVERDUE') {
      throw new ProviderRequestError('NOT_CANCELLABLE');
    }
    charge.state = 'CANCELED';
    this.enqueue('PAYMENT_DELETED', charge, 'PENDING');
  }

  async startAutoBilling(
    providerCustomerId: string,
    mode: AutoBillingMode,
  ): Promise<{ authorizationUrl: string }> {
    this.consumeFailure();
    this.assertCustomer(providerCustomerId);
    this.autoBillingCustomers.add(providerCustomerId);
    return { authorizationUrl: `${FAKE_PAYMENT_URL_BASE}/auto/${providerCustomerId}?mode=${mode}` };
  }

  async revokeAutoBilling(providerCustomerId: string): Promise<void> {
    this.consumeFailure();
    this.assertCustomer(providerCustomerId);
    this.autoBillingCustomers.delete(providerCustomerId);
  }

  async fetchChargeStatus(providerChargeId: string): Promise<NormalizedChargeStatus> {
    this.consumeFailure();
    const charge = this.chargeOrThrow(providerChargeId);
    return {
      providerChargeId: charge.id,
      state: charge.state,
      paymentMethod: charge.paymentMethod,
      paidAt: charge.paidAt,
      receiptUrl: receiptUrlOf(charge),
    };
  }

  async readAccountHealth(_merchantProfileKey: string): Promise<ProviderAccountHealth> {
    this.consumeFailure();
    return { webhookStatus: this.queuePaused ? 'PAUSED' : 'OK', queuePaused: this.queuePaused };
  }

  async reenableWebhookQueue(_merchantProfileKey: string): Promise<void> {
    this.consumeFailure();
    this.queuePaused = false;
  }

  parseWebhook(rawBody: string, _headers: WebhookHeaders): NormalizedProviderEvent {
    return normalizeAsaasWebhook(rawBody);
  }

  // ---- Scenario controls (the fake's own surface, not the port's) ----

  /** The next network call fails once, with the named failure. */
  failNextCall(reason: ProviderRequestFailure): void {
    this.nextFailure = reason;
  }

  pauseWebhookQueue(): void {
    this.queuePaused = true;
  }

  hasAutoBilling(providerCustomerId: string): boolean {
    return this.autoBillingCustomers.has(providerCustomerId);
  }

  /** Pix emits `RECEIVED` only; boleto `CONFIRMED` then `RECEIVED`; a card `CONFIRMED` (`RECEIVED` comes with `simulateCardSettlement`). */
  simulatePayment(providerChargeId: string, method: PaymentMethod): void {
    const charge = this.chargeOrThrow(providerChargeId);
    this.assertState(charge, ['PENDING', 'OVERDUE'], 'pay');
    charge.state = 'PAID';
    charge.paymentMethod = method;
    charge.paidAt = this.clock.now();
    if (method !== 'PIX') this.enqueue('PAYMENT_CONFIRMED', charge, 'CONFIRMED');
    if (method !== 'CARD') this.enqueue('PAYMENT_RECEIVED', charge, 'RECEIVED');
  }

  /** The `RECEIVED` that follows a card's `CONFIRMED` about 32 days later. */
  simulateCardSettlement(providerChargeId: string): void {
    const charge = this.chargeOrThrow(providerChargeId);
    this.assertState(charge, ['PAID'], 'settle');
    this.enqueue('PAYMENT_RECEIVED', charge, 'RECEIVED');
  }

  simulateOverdue(providerChargeId: string): void {
    const charge = this.chargeOrThrow(providerChargeId);
    this.assertState(charge, ['PENDING'], 'mark overdue');
    charge.state = 'OVERDUE';
    this.enqueue('PAYMENT_OVERDUE', charge, 'OVERDUE');
  }

  simulateRefund(providerChargeId: string, kind: 'FULL' | 'PARTIAL'): void {
    const charge = this.chargeOrThrow(providerChargeId);
    this.assertState(charge, ['PAID', 'PARTIALLY_REFUNDED'], 'refund');
    const full = kind === 'FULL';
    charge.state = full ? 'REFUNDED' : 'PARTIALLY_REFUNDED';
    this.enqueue(
      full ? 'PAYMENT_REFUNDED' : 'PAYMENT_PARTIALLY_REFUNDED',
      charge,
      full ? 'REFUNDED' : 'RECEIVED',
    );
  }

  simulateChargeback(providerChargeId: string): void {
    const charge = this.chargeOrThrow(providerChargeId);
    this.assertState(charge, ['PAID'], 'charge back');
    charge.state = 'CHARGEBACK';
    this.enqueue('PAYMENT_CHARGEBACK_REQUESTED', charge, 'CHARGEBACK_REQUESTED');
  }

  /**
   * Hands out and clears the queued webhooks, misbehaving as `options` says. While the queue is
   * paused nothing is handed out and nothing is lost: the events are kept and arrive after the
   * queue is re-enabled, as Asaas stores them (docs/ASAAS_PROVIDER.md § 4).
   */
  drainDeliveries(options: DeliveryOptions = {}): FakeWebhookDelivery[] {
    if (this.queuePaused) return [];
    const drained = applyDeliveryOptions(this.pending, options);
    this.pending = [];
    return drained;
  }

  // ---- internals ----

  private consumeFailure(): void {
    if (this.nextFailure === null) return;
    const reason = this.nextFailure;
    this.nextFailure = null;
    throw new ProviderRequestError(reason);
  }

  // Random, not a counter: a restarted process must never reissue an id an earlier run already
  // persisted for another tenant (the provider ids are unique across the Billing tables).
  private newId(prefix: string): string {
    return `${prefix}_fake_${randomUUID().replaceAll('-', '').slice(0, 20)}`;
  }

  private enqueue(eventName: string, charge: FakeCharge, asaasStatus: string): void {
    this.pending.push(this.emitter.build(eventName, charge, asaasStatus));
  }

  private linkOf(charge: FakeCharge): ProviderPaymentLink {
    return {
      paymentUrl: charge.paymentUrl,
      expiresAt: new Date(this.clock.now().getTime() + LINK_TTL_MS),
    };
  }

  private findByReference(externalReference: string): FakeCharge | undefined {
    return [...this.charges.values()].find(
      (charge) => charge.externalReference === externalReference,
    );
  }

  private chargeOrThrow(providerChargeId: string): FakeCharge {
    const charge = this.charges.get(providerChargeId);
    if (!charge) throw new ProviderRequestError('NOT_FOUND');
    return charge;
  }

  private assertCustomer(providerCustomerId: string): void {
    if (!this.identityByCustomer.has(providerCustomerId)) {
      throw new ProviderRequestError('NOT_FOUND');
    }
  }

  private insertNewCharge(input: CreateProviderChargeInput): FakeCharge {
    assertValidNewCharge(
      input,
      this.identityByCustomer.get(input.providerCustomerId)?.taxId,
      todayInTimezone(ASAAS_ZONE, this.clock.now()),
    );
    const id = this.newId('pay');
    const charge: FakeCharge = {
      id,
      customerId: input.providerCustomerId,
      externalReference: input.externalReference,
      amountMinor: input.lines.reduce((sum, line) => sum + line.amountMinor, 0),
      dueDate: input.dueDate,
      paymentUrl: `${FAKE_PAYMENT_URL_BASE}/${id.replace('pay_', '')}`,
      state: 'PENDING',
      paymentMethod: null,
      paidAt: null,
    };
    this.charges.set(id, charge);
    this.enqueue('PAYMENT_CREATED', charge, 'PENDING');
    return charge;
  }

  private assertState(charge: FakeCharge, allowed: FakeCharge['state'][], action: string): void {
    if (!allowed.includes(charge.state)) {
      throw new Error(`The fake cannot ${action} charge ${charge.id} while it is ${charge.state}`);
    }
  }
}
