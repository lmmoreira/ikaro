import type { BillingProvider } from '../../domain/billing-account.aggregate';
import type { Charge } from '../../domain/charge.aggregate';

export const CHARGE_REPOSITORY = Symbol('IChargeRepository');

export interface ListChargesQuery {
  limit: number;
  offset: number;
}

/**
 * Charges are their own aggregate (not a child of the subscription). Every finder is scoped by
 * `tenantId` except the explicitly cross-tenant job selectors, which take no tenant and are named
 * `…ForJob`. After B-R1 (the subscription row) a use case that changes an existing charge takes
 * B-C1 (`findByIdForUpdate`): docs/LOCK_CATALOG.md § Billing locks.
 */
export interface IChargeRepository {
  findById(tenantId: string, id: string): Promise<Charge | null>;

  /**
   * Lock B-C1: takes `FOR UPDATE` on the charge row, then loads its lines in the same transaction,
   * so a copy read before a provider call is never saved over a newer state. Must run inside an
   * active `ITransactionManager.run()`; throws outside one. Taken after B-R1.
   */
  findByIdForUpdate(tenantId: string, id: string): Promise<Charge | null>;

  /**
   * Lock B-C1 on several charges of one tenant at once: **one** query, `ORDER BY id`, `FOR UPDATE`,
   * their lines loaded in the same transaction. A use case that must lock more than one charge takes
   * them here, never one `findByIdForUpdate` after another (one round trip while the subscription
   * row is held, and one deterministic order). Answers the charges found, in id order; an unknown
   * id is simply absent. Must run inside an active `ITransactionManager.run()`; throws outside one.
   * Taken after B-R1.
   */
  findByIdsForUpdate(tenantId: string, ids: readonly string[]): Promise<Charge[]>;

  /**
   * Cross-tenant job lookup by our own charge id (the id sent to the provider as the external
   * reference), for the webhook that outruns the provider customer's save. It takes no tenant, so
   * the caller must compare the charge's tenant with the one it already resolved. Primary key.
   */
  findByIdForJob(id: string): Promise<Charge | null>;

  /** The webhook has resolved the tenant already; the provider is part of the key (`UQ_billing_charges_provider_charge`). */
  findByProviderChargeId(
    tenantId: string,
    provider: BillingProvider,
    providerChargeId: string,
  ): Promise<Charge | null>;

  /** The charges a tenant can still pay (`PENDING` / `OVERDUE`), oldest due date first. */
  findOpenByTenant(tenantId: string): Promise<Charge[]>;

  /** The subscription's one open `RECOVERY` charge (`UQ_billing_charges_open_recovery`), if any. */
  findOpenRecoveryBySubscription(tenantId: string, subscriptionId: string): Promise<Charge | null>;

  /**
   * The first `PERIOD` charge of the subscription's **current trial**: the one with the earliest
   * period start on or after `periodStartOnOrAfter` that is not `CANCELED` (a re-issued charge
   * replaces a cancelled one). A trial's invoice starts on the day the trial ends, so the caller
   * passes that tenant-local date: a subscription that was exempted and then cleared starts a new
   * trial but keeps its id and its history, and an older paid invoice must never stand in for the
   * new trial's. The trial's invoice for the status sweep (UC-115 rules 2 and 5); `null` when none
   * was issued. Served by `UQ_billing_charges_period (tenant_id, subscription_id, period_start)`.
   */
  findFirstPeriodCharge(
    tenantId: string,
    subscriptionId: string,
    periodStartOnOrAfter: string,
  ): Promise<Charge | null>;

  /** One page of a tenant's history, newest due date first (id as tiebreak), with the unpaged total. */
  listByTenantPage(
    tenantId: string,
    query: ListChargesQuery,
  ): Promise<{ items: Charge[]; total: number }>;

  /**
   * Inserts a new charge with its lines, or updates a loaded one under its optimistic `version`
   * (`ChargeConcurrentModificationError` when the row moved). An update writes **only the mutable
   * columns**, never `provider_creation_attempts` / `provider_creation_last_attempt_at`: the claim
   * owns those. A unique violation is `ChargeAlreadyExistsError` (`UQ_billing_charges_period`) or
   * `RecoveryChargeAlreadyOpenError` (`UQ_billing_charges_open_recovery`): the caller re-reads the
   * existing charge.
   */
  save(charge: Charge): Promise<void>;

  /**
   * The creation lease every creator takes before any `createCharge`: one conditional `UPDATE`
   * that sets the last-attempt instant to `now` and adds 1 to the attempts, only for an open
   * (`PENDING` / `OVERDUE`) charge whose creation is still `PENDING`, with no provider id, whose
   * last attempt is older than the lease (a cancelled or paid charge is never claimed). Returns whether this
   * caller owns the creation. It is the **single place that increments the attempts**, runs as its
   * own statement (never joining the caller's transaction: the lease must be committed before the
   * provider call) and takes no B-C1.
   */
  claimForProviderCreation(tenantId: string, chargeId: string, now: Date): Promise<boolean>;

  // ── Cross-tenant job selectors (no tenant: ids only, each served by its own standalone index) ──

  /**
   * Open charges waiting for the provider whose lease is free at `now` (never attempted, or last
   * attempted more than the lease ago), least recently attempted first (`provider_creation_last_attempt_at`
   * NULLS FIRST, then id: the order of `IDX_billing_charges_creation_retry`), one page after the
   * `after` row: the creation retry. A charge the retry skips (held identity, a profile with no
   * adapter) stays selected, so the caller pages on from the last row it was given instead of asking
   * for the head again.
   * `IDX_billing_charges_creation_retry`.
   */
  listPendingCreationForJob(
    now: Date,
    limit: number,
    after?: PendingCreationRef,
  ): Promise<PendingCreationRef[]>;

  /**
   * Cross-tenant job selector (UC-115 rule 1, M26-S06): one page of the `PENDING` charges whose
   * provider creation is `READY` (the payer has a payment link) and whose due date is on or before
   * `dueOnOrBefore`, ordered by `(due_date, id)`, at most `limit`, after the `after` row. The date
   * is the caller's UTC date (each charge's due date is in its subscription's own zone, so the
   * sweep re-checks the local date). A charge the sweep skips stays selected, so the caller pages on
   * from the last row. Served by `IDX_billing_charges_open`; `status = 'PENDING'` repeats its
   * predicate literally and the `READY` filter is residual.
   */
  listOverdueCandidatesForJob(
    dueOnOrBefore: string,
    limit: number,
    after?: OverdueChargeRef,
  ): Promise<OverdueChargeRef[]>;

  // The reconcile selectors (UC-116, M26-S07). Each is one page of ids, at most `limit`, after the
  // `after` row, in its own index's order, and is served by that index alone. A charge the pass
  // leaves open stays selected, so the caller pages on from the last row it was given: asking for
  // the head again would return the same oldest rows and starve the rest.

  /** Open charges whose due date is on or before `dueOnOrBefore`, by `(due_date, id)`: `IDX_billing_charges_open`. */
  listOpenDueForJob(
    dueOnOrBefore: string,
    limit: number,
    after?: DueChargeRef,
  ): Promise<DueChargeRef[]>;

  /** Every open charge, by `(due_date, id)`: `IDX_billing_charges_open`. */
  listOpenForJob(limit: number, after?: DueChargeRef): Promise<DueChargeRef[]>;

  /**
   * Open `RECOVERY` charges, by `(tenant_id, subscription_id)`: a suspended tenant's way back.
   * `UQ_billing_charges_open_recovery` holds at most one per subscription, so the key is unique.
   */
  listOpenRecoveryForJob(limit: number, after?: RecoveryChargeRef): Promise<RecoveryChargeRef[]>;

  /**
   * Open charges of `TRIALING` subscriptions whose trial ends on or before `trialEndsOnOrBefore`,
   * by `(due_date, id)`: the trial index (`IDX_billing_subscriptions_trial_ends_at`) into the
   * charge's own `(tenant_id, subscription_id, period_start)` unique index.
   */
  listOpenTrialChargesForJob(
    trialEndsOnOrBefore: Date,
    limit: number,
    after?: DueChargeRef,
  ): Promise<DueChargeRef[]>;

  /** Charges paid at or after `paidSince`, by `(paid_at, id)`: `IDX_billing_charges_paid_recent`. */
  listRecentlyPaidForJob(
    paidSince: Date,
    limit: number,
    after?: PaidChargeRef,
  ): Promise<PaidChargeRef[]>;

  /** Locally cancelled charges whose provider cancel is still to do, by `(due_date, id)`: `IDX_billing_charges_cancel_pending`. */
  listProviderCancelPendingForJob(limit: number, after?: DueChargeRef): Promise<DueChargeRef[]>;
}

/** A job selects ids and reads each charge through its own tenant-scoped, locked path. */
export interface ChargeRef {
  tenantId: string;
  id: string;
}

/** A charge with its place in a `(due_date, id)` selection order. */
export interface DueChargeRef extends ChargeRef {
  /** `YYYY-MM-DD`. */
  dueDate: string;
}

/** A charge the overdue rule may be due on, with its place in the selection order. */
export type OverdueChargeRef = DueChargeRef;

/** A charge with its place in the `(paid_at, id)` order of the recently-paid selection. */
export interface PaidChargeRef extends ChargeRef {
  paidAt: Date;
}

/** An open `RECOVERY` charge with the subscription that keys its selection order. */
export interface RecoveryChargeRef extends ChargeRef {
  subscriptionId: string;
}

/** A charge the creation retry may attempt, with its place in the retry order. */
export interface PendingCreationRef extends ChargeRef {
  /** `null` for a charge never attempted: those sort first. */
  lastAttemptAt: Date | null;
}
