import { DateTime } from 'luxon';
import { InvalidProviderWebhookError } from '../../domain/errors/billing-provider.errors';
import type { NormalizedProviderEvent, PaymentMethod } from '../../domain/provider-events';

export const ASAAS_ZONE = 'America/Sao_Paulo';
export const ASAAS_DATE_FORMAT = 'yyyy-MM-dd HH:mm:ss';

// Asaas names a card payment CREDIT_CARD; Ikaro's `charges.method` calls it CARD. UNDEFINED (a charge
// nobody has paid yet) has no method.
const METHOD_BY_ASAAS_BILLING_TYPE: Readonly<Record<string, PaymentMethod>> = {
  PIX: 'PIX',
  BOLETO: 'BOLETO',
  CREDIT_CARD: 'CARD',
};

export function asaasBillingTypeOf(method: PaymentMethod | null): string {
  const entry = Object.entries(METHOD_BY_ASAAS_BILLING_TYPE).find(([, value]) => value === method);
  return entry?.[0] ?? 'UNDEFINED';
}

type ChargeEventType = Exclude<
  NormalizedProviderEvent['type'],
  'AutoBillingAuthorized' | 'AutoBillingRevoked' | 'Ignored'
>;

// Asaas event names the sandbox run observed or the docs state (docs/ASAAS_PROVIDER.md A1, A11).
// The paid signal is the first of CONFIRMED or RECEIVED; the second is a no-op downstream. Anything
// not listed (PAYMENT_CREATED, PAYMENT_CHECKOUT_VIEWED, ...) normalises to `Ignored`.
const CHARGE_EVENT_TYPES: Readonly<Record<string, ChargeEventType>> = {
  PAYMENT_CONFIRMED: 'PaymentConfirmed',
  PAYMENT_RECEIVED: 'PaymentConfirmed',
  PAYMENT_OVERDUE: 'PaymentOverdue',
  PAYMENT_DELETED: 'PaymentCancelled',
  PAYMENT_REFUNDED: 'PaymentRefunded',
  PAYMENT_PARTIALLY_REFUNDED: 'PaymentPartiallyRefunded',
  PAYMENT_CHARGEBACK_REQUESTED: 'PaymentChargeback',
};

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseBody(rawBody: string): JsonRecord {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    throw new InvalidProviderWebhookError('the body is not JSON');
  }
  if (!isRecord(parsed)) throw new InvalidProviderWebhookError('the body is not an object');
  return parsed;
}

function requireString(source: JsonRecord, field: string): string {
  const value = source[field];
  if (typeof value !== 'string' || value === '') {
    throw new InvalidProviderWebhookError(`"${field}" is missing`);
  }
  return value;
}

function optionalString(source: JsonRecord, field: string): string | null {
  const value = source[field];
  return typeof value === 'string' && value !== '' ? value : null;
}

function requireAmountMinor(source: JsonRecord, field: string): number {
  const value = source[field];
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new InvalidProviderWebhookError(`"${field}" is missing`);
  }
  return Math.round(value * 100);
}

/** `dateCreated` is São Paulo local time with no offset (docs/ASAAS_PROVIDER.md § 1), not UTC. */
export function parseAsaasDateTime(value: string): Date {
  const parsed = DateTime.fromFormat(value, ASAAS_DATE_FORMAT, { zone: ASAAS_ZONE });
  if (!parsed.isValid) throw new InvalidProviderWebhookError('"dateCreated" is not a valid date');
  return parsed.toUTC().toJSDate();
}

function paymentMethodOf(billingType: unknown): PaymentMethod | null {
  return typeof billingType === 'string' && Object.hasOwn(METHOD_BY_ASAAS_BILLING_TYPE, billingType)
    ? METHOD_BY_ASAAS_BILLING_TYPE[billingType]
    : null;
}

function buildChargeEvent(
  type: ChargeEventType,
  base: { providerEventId: string; occurredAt: Date },
  payment: JsonRecord,
): NormalizedProviderEvent {
  const charge = {
    ...base,
    providerChargeId: requireString(payment, 'id'),
    providerCustomerId: optionalString(payment, 'customer'),
    chargeReference: optionalString(payment, 'externalReference'),
    amountMinor: requireAmountMinor(payment, 'value'),
  };
  if (type === 'PaymentConfirmed') {
    return {
      ...charge,
      type,
      paymentMethod: paymentMethodOf(payment['billingType']),
      receiptUrl: optionalString(payment, 'transactionReceiptUrl'),
    };
  }
  return { ...charge, type };
}

/** Pure: the same body always yields the same event and `providerEventId`. De-duplication is the inbox's. */
export function normalizeAsaasWebhook(rawBody: string): NormalizedProviderEvent {
  const body = parseBody(rawBody);
  const providerEventId = requireString(body, 'id');
  const eventName = requireString(body, 'event');
  const occurredAt = parseAsaasDateTime(requireString(body, 'dateCreated'));
  const type = Object.hasOwn(CHARGE_EVENT_TYPES, eventName)
    ? CHARGE_EVENT_TYPES[eventName]
    : undefined;
  if (type === undefined) {
    return { type: 'Ignored', providerEventId, occurredAt, providerEventName: eventName };
  }
  const payment = body['payment'];
  if (!isRecord(payment)) throw new InvalidProviderWebhookError('"payment" is missing');
  return buildChargeEvent(type, { providerEventId, occurredAt }, payment);
}
