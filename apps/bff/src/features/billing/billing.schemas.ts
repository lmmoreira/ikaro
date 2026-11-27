import { BILLING_TAX_ID_TYPES, CHATBOT_TIERS, FEATURE_KEYS } from '@ikaro/validation';
import { z } from 'zod';

// The backend's `GET /internal/billing/tenants/{id}/access` answer, parsed at the BFF boundary.
// Only the three fields every role-reduced view is built from are declared: zod strips the rest,
// so `suspensionReason`, `provisional` and `degraded` can never reach a mapper, let alone the web.
export const BackendTenantAccessSchema = z.object({
  status: z.enum(['TRIALING', 'ACTIVE', 'PAST_DUE', 'SUSPENDED']),
  operational: z.boolean(),
  features: z.array(
    z.object({
      key: z.enum(FEATURE_KEYS),
      tier: z.enum(['STANDARD', ...CHATBOT_TIERS]),
    }),
  ),
});

// ── Manager billing reads (M26-S14, UC-117) ───────────────────────────────────────────────────
// The backend's summary and charge history, parsed at the BFF boundary. Every object is declared
// field by field, and zod strips what is not declared, so nothing the backend might add later can
// reach the web by accident (a payment URL above all).

export const FEATURE_KEY = z.enum(FEATURE_KEYS);
export const TIER = z.enum(['STANDARD', ...CHATBOT_TIERS]);
const STATUS = z.enum(['TRIALING', 'ACTIVE', 'PAST_DUE', 'SUSPENDED']);
const CHARGE_KIND = z.enum(['PERIOD', 'RECOVERY']);
const CHARGE_STATUS = z.enum([
  'PENDING',
  'PAID',
  'OVERDUE',
  'FAILED',
  'CANCELED',
  'REFUNDED',
  'CHARGEBACK',
]);
export const MINOR = z.number().int();

// The receipt link is the provider's, rendered by the web as a link: only an `https:` URL may pass,
// so a `javascript:`, `data:` or plain `http:` value can never reach an `href`.
const HTTPS_URL = z.string().refine((value) => {
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
}, 'must be an https URL');

const OpenChargeSchema = z.object({
  id: z.string(),
  kind: CHARGE_KIND,
  dueDate: z.string(),
  subtotalMinor: MINOR,
  taxMinor: MINOR,
  amountMinor: MINOR,
  status: CHARGE_STATUS,
  hasPaymentLink: z.boolean(),
  paymentLinkExpiresAt: z.string().nullable(),
});

const ReadySummarySchema = z.object({
  provisioning: z.literal(false),
  status: STATUS,
  exempt: z.boolean(),
  suspensionReason: z.enum(['NON_PAYMENT', 'CANCELED', 'PAYMENT_REVERSED', 'OPERATOR']).nullable(),
  currency: z.string(),
  countryCode: z.string(),
  timezone: z.string(),
  cycle: z.literal('MONTHLY'),
  nextCycle: z.null(),
  nextCycleFrom: z.null(),
  trialEndsAt: z.string().nullable(),
  nextDueDate: z.string().nullable(),
  pastDueSince: z.string().nullable(),
  suspendsAt: z.string().nullable(),
  cancelAt: z.string().nullable(),
  purgeAt: z.string().nullable(),
  planConfirmationRequired: z.boolean(),
  planConfirmationFallbackAt: z.string().nullable(),
  canDiscard: z.literal(false),
  firstChargePaid: z.boolean(),
  addressRequired: z.boolean(),
  items: z.array(
    z.object({ featureKey: FEATURE_KEY, tier: TIER, unitPriceMinor: MINOR.nullable() }),
  ),
  totalMinor: MINOR.nullable(),
  openCharge: OpenChargeSchema.nullable(),
  autoBilling: z.object({
    mode: z.literal('NONE'),
    status: z.literal('INACTIVE'),
    label: z.null(),
  }),
  paymentConfirmationPending: z.boolean(),
  upcomingPriceChanges: z.array(
    z.object({
      featureKey: FEATURE_KEY,
      tier: TIER,
      currentAmountMinor: MINOR,
      newAmountMinor: MINOR,
      effectiveFrom: z.string(),
    }),
  ),
});

export const BackendBillingSummarySchema = z.discriminatedUnion('provisioning', [
  z.object({ provisioning: z.literal(true) }),
  ReadySummarySchema,
]);

const ChargeHistoryItemSchema = z.object({
  id: z.string(),
  kind: CHARGE_KIND,
  periodStart: z.string().nullable(),
  periodEnd: z.string().nullable(),
  dueDate: z.string(),
  subtotalMinor: MINOR,
  taxMinor: MINOR,
  amountMinor: MINOR,
  currency: z.string(),
  status: CHARGE_STATUS,
  method: z.enum(['PIX', 'BOLETO', 'CARD']).nullable(),
  paidAt: z.string().nullable(),
  receiptUrl: HTTPS_URL.nullable(),
  lines: z.array(z.object({ featureKey: FEATURE_KEY, tier: TIER, unitPriceMinor: MINOR })),
  taxLines: z.array(z.never()),
});

export const BackendBillingChargesSchema = z.object({
  items: z.array(ChargeHistoryItemSchema),
  pagination: z.object({
    limit: z.number().int(),
    offset: z.number().int(),
    total: z.number().int(),
    hasMore: z.boolean(),
  }),
});

// ── Plan reads (M26-S17, UC-136) ──────────────────────────────────────────────────────────────
// The Plano tab's catalog and the preview answer, declared field by field like the summary above.

export const DATE = z.string();
const PLAN_TIER = z.object({
  tier: TIER,
  unitPriceMinor: MINOR.nullable(),
  available: z.boolean(),
  upcoming: z.object({ amountMinor: MINOR, effectiveFrom: DATE }).optional(),
});

const ReadyPlanSchema = z.object({
  provisioning: z.literal(false),
  countryCode: z.string(),
  currency: z.string(),
  readOnly: z
    .object({
      reason: z.enum(['PAST_DUE', 'OPERATOR_SUSPENDED', 'CANCEL_SCHEDULED', 'EXEMPT']),
    })
    .nullable(),
  trial: z.object({ active: z.boolean(), planConfirmed: z.boolean() }),
  features: z.array(
    z.object({
      featureKey: FEATURE_KEY,
      requires: z.array(FEATURE_KEY),
      tiers: z.array(PLAN_TIER),
    }),
  ),
  current: z.array(z.object({ featureKey: FEATURE_KEY, tier: TIER, endsAt: DATE.nullable() })),
  scheduled: z
    .array(z.object({ featureKey: FEATURE_KEY, tier: TIER.nullable(), startsAt: DATE }))
    .nullable(),
  totalMinor: MINOR.nullable(),
});

export const BackendBillingPlanSchema = z.discriminatedUnion('provisioning', [
  z.object({ provisioning: z.literal(true) }),
  ReadyPlanSchema,
]);

// ── Paying a charge (M26-S15, UC-119) ─────────────────────────────────────────────────────────
// The payment link is the one place a provider URL reaches the web, so it is the one place the URL
// is declared, and only as an `https:` one (as the receipt link): a `javascript:` or `http:` value
// can never become a redirect. A paid charge carries no link. The backend answers `PENDING` or
// `OVERDUE` today; `FAILED` is payable and arrives with M29.
export const BackendBillingPaymentLinkSchema = z.union([
  z.object({ status: z.literal('PAID'), paymentUrl: z.null(), expiresAt: z.null() }),
  z.object({
    status: z.enum(['PENDING', 'OVERDUE', 'FAILED']),
    paymentUrl: HTTPS_URL,
    expiresAt: z.string().nullable(),
  }),
]);

export const BackendBillingPaymentReturnSchema = z.object({
  status: CHARGE_STATUS,
  paymentConfirmationPending: z.boolean(),
});

export const BackendBillingPlanPreviewSchema = z.object({
  changes: z.array(
    z.object({
      featureKey: FEATURE_KEY,
      kind: z.enum(['ADD', 'REMOVE', 'TIER_CHANGE']),
      fromTier: TIER.nullable(),
      toTier: TIER.nullable(),
      effectiveFrom: DATE.nullable(),
    }),
  ),
  newTotalMinor: MINOR,
  effectiveFrom: DATE.nullable(),
  deferredBecauseNextInvoicePaid: z.boolean(),
});

// ── Billing identity (M26-S16, UC-118) ────────────────────────────────────────────────────────
// The backend's identity read and save answer, parsed at the boundary. The request body is the
// shared `BillingIdentityUpdateSchema` of `@ikaro/validation`, imported by the controller, so the
// backend and this layer hold one copy of the body rules.
const IdentityAddressSchema = z.object({
  street: z.string(),
  number: z.string(),
  complement: z.string().nullable(),
  neighborhood: z.string().nullable(),
  city: z.string(),
  state: z.string(),
  zipCode: z.string(),
});

const ReadyIdentitySchema = z.object({
  provisioning: z.literal(false),
  taxIdType: z.enum(BILLING_TAX_ID_TYPES).nullable(),
  taxId: z.string().nullable(),
  legalName: z.string().nullable(),
  billingEmail: z.string().nullable(),
  address: IdentityAddressSchema.nullable(),
});

export const BackendBillingIdentitySchema = z.discriminatedUnion('provisioning', [
  z.object({ provisioning: z.literal(true) }),
  ReadyIdentitySchema,
]);

// `PUT` never answers the provisioning window with a 200 (it is a 503), so its answer is the ready shape.
export const BackendBillingIdentitySavedSchema = ReadyIdentitySchema;
