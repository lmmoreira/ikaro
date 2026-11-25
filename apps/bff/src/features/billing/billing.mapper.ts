import { HttpException } from '@nestjs/common';
import {
  CUSTOMER_FEATURE_KEYS,
  type ActorRole,
  type BillingAccessResponse,
  type BillingChargesResponse,
  type BillingOpenChargeDto,
  type BillingPlanPreviewResponse,
  type BillingPlanResponse,
  type BillingSummaryReadyResponse,
  type BillingSummaryResponse,
} from '@ikaro/types';
import { FEATURE_KEYS } from '@ikaro/validation';
import { ZodError } from 'zod';
import type {
  BackendBillingCharges,
  BackendBillingPlan,
  BackendBillingPlanPreview,
  BackendBillingSummary,
  BackendTenantAccess,
} from './billing.types';

/** The one thing the recovery needs from a logger, so a spec can record messages without a mock. */
export interface AccessLookupLogger {
  error(message: string): void;
}

// What the BFF assumes when the backend lookup itself failed (UC-120 A2, fail open): an operational
// tenant with every sellable feature, chatbot at `BASIC`, exactly what a trial grants.
export function failOpenBackendAccess(): BackendTenantAccess {
  return {
    status: 'ACTIVE',
    operational: true,
    features: FEATURE_KEYS.map((key) => ({ key, tier: key === 'CHATBOT' ? 'BASIC' : 'STANDARD' })),
  };
}

function describeCause(err: unknown): string {
  if (err instanceof ZodError) return 'invalid backend response';
  return err instanceof Error ? err.message : String(err);
}

// The `.catch(...)` of the access read (UC-120 A2): a 4xx is a real answer from the backend (an
// unknown tenant, a bad key) and is rethrown; anything else (an outage, a network error, a body
// that does not match the contract) fails open and is logged, so a paying tenant is never locked
// out by our own failure and the fallback is never silent.
export function recoverAccessLookup(
  err: unknown,
  tenantId: string,
  logger: AccessLookupLogger,
): BackendTenantAccess {
  if (err instanceof HttpException && err.getStatus() < 500) throw err;
  logger.error(
    `Billing access lookup failed for tenant '${tenantId}', failing open: ${describeCause(err)}`,
  );
  return failOpenBackendAccess();
}

// The role reduction (M25-S13, docs/API_CONTRACTS.md § Billing — Access Resolution): a manager runs
// the account and sees the status; staff see what is locked but never the payment state; a customer
// only learns whether the tenant is operational and which customer-facing features it holds.
// Built field by field, never by spreading the
// backend answer, so nothing else can leak through.
export function toBillingAccessResponse(
  role: ActorRole,
  access: BackendTenantAccess,
): BillingAccessResponse {
  switch (role) {
    case 'MANAGER':
      return { status: access.status, operational: access.operational, features: access.features };
    case 'STAFF':
      return { operational: access.operational, features: access.features };
    case 'CUSTOMER':
      return {
        operational: access.operational,
        features: CUSTOMER_FEATURE_KEYS.filter((key) => access.features.some((f) => f.key === key)),
      };
  }
}

type BackendReadySummary = Extract<BackendBillingSummary, { provisioning: false }>;

// The manager's billing page reads (M26-S14, UC-117): enums and numbers only, never a display
// string (the web translates) and never a URL. The backend answer was parsed at the boundary, which
// strips undeclared fields; every object is still rebuilt field by field here, so the open charge in
// particular can never carry a link the backend did not mean to send.
export function toBillingSummaryResponse(backend: BackendBillingSummary): BillingSummaryResponse {
  if (backend.provisioning) return { provisioning: true };
  return {
    provisioning: false,
    status: backend.status,
    exempt: backend.exempt,
    suspensionReason: backend.suspensionReason,
    currency: backend.currency,
    countryCode: backend.countryCode,
    timezone: backend.timezone,
    cycle: backend.cycle,
    nextCycle: backend.nextCycle,
    nextCycleFrom: backend.nextCycleFrom,
    trialEndsAt: backend.trialEndsAt,
    nextDueDate: backend.nextDueDate,
    pastDueSince: backend.pastDueSince,
    suspendsAt: backend.suspendsAt,
    cancelAt: backend.cancelAt,
    purgeAt: backend.purgeAt,
    planConfirmationRequired: backend.planConfirmationRequired,
    planConfirmationFallbackAt: backend.planConfirmationFallbackAt,
    canDiscard: backend.canDiscard,
    firstChargePaid: backend.firstChargePaid,
    addressRequired: backend.addressRequired,
    ...toSummaryMoney(backend),
  };
}

// The plan, the open charge and the price changes: the part of the summary that carries amounts.
function toSummaryMoney(
  backend: BackendReadySummary,
): Pick<
  BillingSummaryReadyResponse,
  | 'items'
  | 'totalMinor'
  | 'openCharge'
  | 'autoBilling'
  | 'paymentConfirmationPending'
  | 'upcomingPriceChanges'
> {
  return {
    items: backend.items.map((item) => ({
      featureKey: item.featureKey,
      tier: item.tier,
      unitPriceMinor: item.unitPriceMinor,
    })),
    totalMinor: backend.totalMinor,
    openCharge: backend.openCharge ? toOpenCharge(backend.openCharge) : null,
    autoBilling: { mode: 'NONE', status: 'INACTIVE', label: null },
    paymentConfirmationPending: backend.paymentConfirmationPending,
    upcomingPriceChanges: backend.upcomingPriceChanges.map((change) => ({
      featureKey: change.featureKey,
      tier: change.tier,
      currentAmountMinor: change.currentAmountMinor,
      newAmountMinor: change.newAmountMinor,
      effectiveFrom: change.effectiveFrom,
    })),
  };
}

function toOpenCharge(
  charge: NonNullable<BackendReadySummary['openCharge']>,
): BillingOpenChargeDto {
  return {
    id: charge.id,
    kind: charge.kind,
    dueDate: charge.dueDate,
    subtotalMinor: charge.subtotalMinor,
    taxMinor: charge.taxMinor,
    amountMinor: charge.amountMinor,
    status: charge.status,
    hasPaymentLink: charge.hasPaymentLink,
    paymentLinkExpiresAt: charge.paymentLinkExpiresAt,
  };
}

export function toBillingChargesResponse(backend: BackendBillingCharges): BillingChargesResponse {
  return {
    items: backend.items.map((charge) => ({
      id: charge.id,
      kind: charge.kind,
      periodStart: charge.periodStart,
      periodEnd: charge.periodEnd,
      dueDate: charge.dueDate,
      subtotalMinor: charge.subtotalMinor,
      taxMinor: charge.taxMinor,
      amountMinor: charge.amountMinor,
      currency: charge.currency,
      status: charge.status,
      method: charge.method,
      paidAt: charge.paidAt,
      receiptUrl: charge.receiptUrl,
      lines: charge.lines.map((line) => ({
        featureKey: line.featureKey,
        tier: line.tier,
        unitPriceMinor: line.unitPriceMinor,
      })),
      taxLines: [],
    })),
    pagination: {
      limit: backend.pagination.limit,
      offset: backend.pagination.offset,
      total: backend.pagination.total,
      hasMore: backend.pagination.hasMore,
    },
  };
}

export function toBillingPlanResponse(backend: BackendBillingPlan): BillingPlanResponse {
  if (backend.provisioning) return { provisioning: true };
  return {
    provisioning: false,
    countryCode: backend.countryCode,
    currency: backend.currency,
    readOnly: backend.readOnly === null ? null : { reason: backend.readOnly.reason },
    trial: { active: backend.trial.active, planConfirmed: backend.trial.planConfirmed },
    features: backend.features.map((feature) => ({
      featureKey: feature.featureKey,
      requires: [...feature.requires],
      tiers: feature.tiers.map((tier) => ({
        tier: tier.tier,
        unitPriceMinor: tier.unitPriceMinor,
        available: tier.available,
        ...(tier.upcoming && {
          upcoming: {
            amountMinor: tier.upcoming.amountMinor,
            effectiveFrom: tier.upcoming.effectiveFrom,
          },
        }),
      })),
    })),
    current: backend.current.map((item) => ({
      featureKey: item.featureKey,
      tier: item.tier,
      endsAt: item.endsAt,
    })),
    scheduled:
      backend.scheduled === null
        ? null
        : backend.scheduled.map((item) => ({
            featureKey: item.featureKey,
            tier: item.tier,
            startsAt: item.startsAt,
          })),
    totalMinor: backend.totalMinor,
  };
}

export function toBillingPlanPreviewResponse(
  backend: BackendBillingPlanPreview,
): BillingPlanPreviewResponse {
  return {
    changes: backend.changes.map((change) => ({
      featureKey: change.featureKey,
      kind: change.kind,
      fromTier: change.fromTier,
      toTier: change.toTier,
      effectiveFrom: change.effectiveFrom,
    })),
    newTotalMinor: backend.newTotalMinor,
    effectiveFrom: backend.effectiveFrom,
    deferredBecauseNextInvoicePaid: backend.deferredBecauseNextInvoicePaid,
  };
}
