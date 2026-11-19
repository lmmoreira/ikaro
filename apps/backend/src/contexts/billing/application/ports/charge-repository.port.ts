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
   * that sets the last-attempt instant to `now` and adds 1 to the attempts, only for a `PENDING`
   * charge with no provider id whose last attempt is older than the lease. Returns whether this
   * caller owns the creation. It is the **single place that increments the attempts**, runs as its
   * own statement (never joining the caller's transaction: the lease must be committed before the
   * provider call) and takes no B-C1.
   */
  claimForProviderCreation(tenantId: string, chargeId: string, now: Date): Promise<boolean>;

  // ── Cross-tenant job selectors (no tenant: ids only, each served by its own standalone index) ──

  /**
   * Charges waiting for the provider whose lease is free at `now` (never attempted, or last
   * attempted more than the lease ago), least recently attempted first: the creation retry.
   * `IDX_billing_charges_creation_retry`.
   */
  listPendingCreationForJob(now: Date, limit: number): Promise<ChargeRef[]>;

  /** Open charges whose due date is `<= dueOnOrBefore` (due soon / overdue sweep): `IDX_billing_charges_open`. */
  listOpenDueForJob(dueOnOrBefore: string, limit: number): Promise<ChargeRef[]>;

  /** Every open charge, for the reconcile pass: `IDX_billing_charges_open`. */
  listOpenForJob(limit: number): Promise<ChargeRef[]>;

  /** Locally cancelled charges whose provider cancel is still to do: `IDX_billing_charges_cancel_pending`. */
  listProviderCancelPendingForJob(limit: number): Promise<ChargeRef[]>;
}

/** A job selects ids and reads each charge through its own tenant-scoped, locked path. */
export interface ChargeRef {
  tenantId: string;
  id: string;
}
