// Billing constants defined once (docs/DOMAIN_MODEL.md § Context 7: Billing Context, "Constants").
// Every later Billing constant joins this file, added by the first story that needs it (M26-D5);
// `TRIAL_DAYS` and `PROVISIONING_GRACE_MINUTES` stay where M25 put them.

/** A recovery charge is due this many days after issue (a charge due today would be OVERDUE on the next sweep). */
export const RECOVERY_CHARGE_DUE_DAYS = 7;

/** A creation claim is held this long before another creator may take the charge over. */
export const PROVIDER_CREATION_LEASE_MINUTES = 10;

/** A `PERIOD` charge is issued once its due date is this many days away (UC-113; 30 for annual, slice H). */
export const CHARGE_ISSUE_LEAD_DAYS = 10;

/** A trial whose plan is still unconfirmed is invoiced from the default selection this many days before it ends (UC-113 A10). */
export const PLAN_CONFIRM_FALLBACK_DAYS = 3;

/** How many rows one page of a Billing job's selection returns; a run pages on until the selection is exhausted. */
export const BILLING_JOB_PAGE_SIZE = 500;

/** UC-115 rule 2: an unpaid trial is suspended this many hours after it ends, so a payment still settling is not judged early. */
export const PAYMENT_SETTLEMENT_MARGIN_HOURS = 24;

/**
 * UC-115 rule 2: the margin when the manager already returned from the payment page while the first
 * charge is still open (the signature of a boleto that has not compensated), in business days:
 * Monday to Friday of the tenant-local calendar, with no holiday calendar (a known limitation).
 */
export const PAYMENT_PENDING_MARGIN_BUSINESS_DAYS = 3;
