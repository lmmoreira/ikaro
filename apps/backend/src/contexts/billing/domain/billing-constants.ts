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

/** UC-116: the UTC hour from which the daily full reconcile pass runs (the hourly job runs it once it is due). */
export const FULL_RECONCILE_HOUR_UTC = 4;

/** UC-116: a full reconcile pass is due again once the last complete one is older than this many hours. */
export const FULL_RECONCILE_INTERVAL_HOURS = 24;

/** UC-116: the at-risk scope covers trials ending within this many days. */
export const RECONCILE_AT_RISK_TRIAL_DAYS = 14;

/** UC-116: the full pass re-reads charges paid within this many days (a card `RECEIVED` lands about 32 days after `CONFIRMED`). */
export const RECONCILE_PAID_WINDOW_DAYS = 35;

/**
 * UC-116: the most charges one reconcile run reads at the provider: a ceiling on the count, with
 * `RECONCILE_RUN_BUDGET_MS` as the bound on the time. A run that reaches it is truncated and
 * advances nothing.
 */
export const RECONCILE_RUN_LIMIT = 1500;

/**
 * UC-116: how long a reconcile run keeps starting provider reads. The push subscription's ack
 * deadline is 60 s, so a run must end well inside it whatever the provider's latency: once this
 * much time has passed no further charge is read, the run is truncated and advances nothing (the
 * reads already in flight finish, which leaves the rest of the 60 s for them).
 */
export const RECONCILE_RUN_BUDGET_MS = 40_000;

/** UC-116: provider reads in flight at once (the provider allows 50 concurrent GETs). */
export const RECONCILE_CONCURRENCY = 10;

/** UC-140: a `RESERVED` signup registration older than this is an orphan (a failed signup step) and is released. */
export const STALE_SIGNUP_RESERVATION_HOURS = 1;

/** UC-140: the suspension freeze starts when no reconcile pass has succeeded for this many hours. */
export const SUSPENSION_FREEZE_RECONCILE_STALE_HOURS = 24;

/** UC-140: the freeze also starts after this many consecutive failed provider health reads. */
export const SUSPENSION_FREEZE_FAILED_HEALTH_READS = 2;

/**
 * UC-140: how long one self-heal run keeps paging tenants for a missing subscription, inside the
 * push subscription's 60 s ack deadline. A healthy tenant stays in the listing (it is old and has
 * its subscription), so every run walks the keyset from the oldest tenant to the end. A page is two
 * indexed reads, so the budget is reached only at hundreds of thousands of tenants; past it the run
 * logs `truncated` and the newest tenants are not reached (no cursor is kept between runs).
 */
export const SELF_HEAL_REPAIR_BUDGET_MS = 40_000;
