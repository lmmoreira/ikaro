import type { FeatureKey } from '@ikaro/validation';
import { uuidv7 } from '../../../../shared/domain/uuid-v7';
import { CalendarDate } from '../../../../shared/value-objects/calendar-date.vo';
import type { BillingProvider } from '../../domain/billing-account.aggregate';
import {
  Charge,
  type ChargeKind,
  type ChargeProviderCreationStatus,
  type ChargeStatus,
} from '../../domain/charge.aggregate';
import { ChargeLine } from '../../domain/charge-line';
import type { FeatureTier } from '../../domain/feature-price.aggregate';
import type { PaymentMethod } from '../../domain/provider-events';
import { MinorAmount } from '../../domain/value-objects/minor-amount.vo';
import { ChargeLineEntity } from '../entities/charge-line.entity';
import { ChargeEntity } from '../entities/charge.entity';

// BIGINT comes back from the driver as a string; the amounts are safe integers (M25-D4).
function toMinor(value: string, currency: string): MinorAmount {
  return MinorAmount.reconstitute(Number(value), currency);
}

function optionalDate(value: string | null): CalendarDate | null {
  return value === null ? null : CalendarDate.reconstitute(value);
}

export function chargeLineToDomain(row: ChargeLineEntity, currency: string): ChargeLine {
  return ChargeLine.reconstitute({
    featureKey: row.featureKey as FeatureKey,
    tier: row.tier as FeatureTier,
    unitPrice: toMinor(row.unitPriceMinor, currency),
  });
}

export function chargeToDomain(entity: ChargeEntity, lines: ChargeLineEntity[]): Charge {
  // CHAR(3) comes back space-padded when shorter; a currency is exactly 3 wide.
  const currency = entity.currency.trim();
  return Charge.reconstitute({
    id: entity.id,
    tenantId: entity.tenantId,
    subscriptionId: entity.subscriptionId,
    merchantProfileKey: entity.merchantProfileKey,
    kind: entity.kind as ChargeKind,
    periodStart: optionalDate(entity.periodStart),
    periodEnd: optionalDate(entity.periodEnd),
    dueDate: CalendarDate.reconstitute(entity.dueDate),
    lines: lines.map((row) => chargeLineToDomain(row, currency)),
    subtotal: toMinor(entity.subtotalMinor, currency),
    amount: toMinor(entity.amountMinor, currency),
    status: entity.status as ChargeStatus,
    method: entity.method as PaymentMethod | null,
    paidAt: entity.paidAt,
    provider: entity.provider as BillingProvider | null,
    providerChargeId: entity.providerChargeId,
    paymentUrl: entity.paymentUrl,
    paymentUrlExpiresAt: entity.paymentUrlExpiresAt,
    receiptUrl: entity.receiptUrl,
    paymentReturnSeenAt: entity.paymentReturnSeenAt,
    refunded: toMinor(entity.refundedAmountMinor, currency),
    providerCreationStatus: entity.providerCreationStatus as ChargeProviderCreationStatus,
    providerCreationAttempts: entity.providerCreationAttempts,
    providerCreationLastAttemptAt: entity.providerCreationLastAttemptAt,
    providerCancelPending: entity.providerCancelPending,
    version: entity.version,
  });
}

/** The full row; `version` is set by the repository, which owns the optimistic lock. */
export function chargeToEntity(charge: Charge, version: number): ChargeEntity {
  const entity = new ChargeEntity();
  entity.id = charge.id;
  entity.tenantId = charge.tenantId;
  entity.subscriptionId = charge.subscriptionId;
  entity.kind = charge.kind;
  entity.periodStart = charge.periodStart?.value ?? null;
  entity.periodEnd = charge.periodEnd?.value ?? null;
  entity.dueDate = charge.dueDate.value;
  entity.subtotalMinor = String(charge.subtotal.amountMinor);
  entity.amountMinor = String(charge.amount.amountMinor);
  entity.currency = charge.amount.currency;
  entity.merchantProfileKey = charge.merchantProfileKey;
  entity.status = charge.status;
  entity.method = charge.method;
  entity.paidAt = charge.paidAt;
  entity.provider = charge.provider;
  entity.providerChargeId = charge.providerChargeId;
  entity.paymentUrl = charge.paymentUrl;
  entity.paymentUrlExpiresAt = charge.paymentUrlExpiresAt;
  entity.receiptUrl = charge.receiptUrl;
  entity.paymentReturnSeenAt = charge.paymentReturnSeenAt;
  entity.refundedAmountMinor = String(charge.refunded.amountMinor);
  entity.providerCreationStatus = charge.providerCreationStatus;
  entity.providerCreationAttempts = charge.providerCreationAttempts;
  entity.providerCreationLastAttemptAt = charge.providerCreationLastAttemptAt;
  entity.providerCancelPending = charge.providerCancelPending;
  entity.version = version;
  entity.updatedAt = new Date();
  return entity;
}

/**
 * The columns an UPDATE may change: the status and the payment / provider fields. The identity,
 * the lines, the amounts, the kind, the period, the due date and the merchant profile key are fixed
 * at insert, and **`provider_creation_attempts` / `provider_creation_last_attempt_at` are never
 * written here**: only the repository's claim changes them, so a stale aggregate cannot clobber it.
 */
export function chargeUpdateSet(entity: ChargeEntity): Partial<ChargeEntity> {
  return {
    status: entity.status,
    method: entity.method,
    paidAt: entity.paidAt,
    provider: entity.provider,
    providerChargeId: entity.providerChargeId,
    paymentUrl: entity.paymentUrl,
    paymentUrlExpiresAt: entity.paymentUrlExpiresAt,
    receiptUrl: entity.receiptUrl,
    paymentReturnSeenAt: entity.paymentReturnSeenAt,
    refundedAmountMinor: entity.refundedAmountMinor,
    providerCreationStatus: entity.providerCreationStatus,
    providerCancelPending: entity.providerCancelPending,
    version: entity.version,
    updatedAt: entity.updatedAt,
  };
}

export function chargeLineToEntity(
  line: ChargeLine,
  tenantId: string,
  chargeId: string,
): ChargeLineEntity {
  const row = new ChargeLineEntity();
  row.id = uuidv7();
  row.tenantId = tenantId;
  row.chargeId = chargeId;
  row.featureKey = line.featureKey;
  row.tier = line.tier;
  row.unitPriceMinor = String(line.unitPriceMinor);
  return row;
}
