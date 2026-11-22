import { DateTime } from 'luxon';
import { EntityManager, Repository, SelectQueryBuilder } from 'typeorm';
import type { SweepDueRef } from '../../application/ports/subscription-repository.port';
import { GRACE_DAYS } from '../../domain/subscription.types';
import { SubscriptionEntity } from '../entities/subscription.entity';

// The status sweep's cross-tenant selectors (UC-115, M26-S06), one per rule, each served by its own
// standalone index (a `(tenant_id, …)` composite cannot be seeked without the tenant). The builders
// are exported so the integration spec can `EXPLAIN` the exact SQL that runs. Every predicate that
// belongs to an index is a literal on purpose: a partial index is used only when the planner can
// prove the query implies it, which a bound parameter would hide. The order is the index's order
// and the page is a keyset on `(instant, tenant_id)`: a row the sweep skips (a trial inside its
// margin, a frozen profile) stays selected, so asking for the head again would starve the rows
// behind it.

function sweepQuery(
  repo: Repository<SubscriptionEntity>,
  dueColumn: string,
): SelectQueryBuilder<SubscriptionEntity> {
  return repo
    .createQueryBuilder('s')
    .select('s.tenantId', 'tenantId')
    .addSelect(dueColumn, 'dueAt');
}

function page(
  query: SelectQueryBuilder<SubscriptionEntity>,
  dueColumn: string,
  limit: number,
  after?: SweepDueRef,
): SelectQueryBuilder<SubscriptionEntity> {
  if (after) {
    query.andWhere(`(${dueColumn}, s.tenantId) > (:afterAt, :afterTenant)`, {
      afterAt: after.dueAt,
      afterTenant: after.tenantId,
    });
  }
  return query.orderBy(dueColumn, 'ASC').addOrderBy('s.tenantId', 'ASC').limit(limit);
}

/** Rules 2 and 5: `IDX_billing_subscriptions_trial_ends_at` (partial on `status = 'TRIALING'`). */
export function buildTrialEndedQuery(
  repo: Repository<SubscriptionEntity>,
  now: Date,
  limit: number,
  after?: SweepDueRef,
): SelectQueryBuilder<SubscriptionEntity> {
  const query = sweepQuery(repo, 's.trialEndsAt')
    .where("s.status = 'TRIALING'")
    .andWhere('NOT s.exempt')
    .andWhere('s.trialEndsAt <= :now', { now });
  return page(query, 's.trialEndsAt', limit, after);
}

/**
 * Rule 3: `IDX_billing_subscriptions_status_past_due_since`. The cutoff is computed here in UTC
 * (`now` minus the 14 days) so SQL does no day arithmetic in the session zone; a later operator
 * `grace_until` keeps the subscription out until that instant has passed.
 */
export function buildGraceExpiredQuery(
  repo: Repository<SubscriptionEntity>,
  now: Date,
  limit: number,
  after?: SweepDueRef,
): SelectQueryBuilder<SubscriptionEntity> {
  const cutoff = DateTime.fromJSDate(now, { zone: 'utc' }).minus({ days: GRACE_DAYS }).toJSDate();
  const query = sweepQuery(repo, 's.pastDueSince')
    .where("s.status = 'PAST_DUE'")
    .andWhere('NOT s.exempt')
    .andWhere('s.pastDueSince <= :cutoff', { cutoff })
    .andWhere('(s.graceUntil IS NULL OR s.graceUntil <= :now)', { now });
  return page(query, 's.pastDueSince', limit, after);
}

/**
 * Rule 4: `IDX_billing_subscriptions_cancel_at` (partial on `cancel_at IS NOT NULL`). The status
 * is a residual filter: a `SUSPENDED` subscription keeps its reason, so it never matches, and the
 * rows it leaves in the index are bounded by the clean-up delay (90 to 180 days).
 */
export function buildCancelDueQuery(
  repo: Repository<SubscriptionEntity>,
  now: Date,
  limit: number,
  after?: SweepDueRef,
): SelectQueryBuilder<SubscriptionEntity> {
  const query = sweepQuery(repo, 's.cancelAt')
    .where('s.cancelAt IS NOT NULL')
    .andWhere('s.cancelAt <= :now', { now })
    .andWhere("s.status IN ('TRIALING', 'ACTIVE', 'PAST_DUE')")
    .andWhere('NOT s.exempt');
  return page(query, 's.cancelAt', limit, after);
}

// The provider accounts in use (UC-116): one row per distinct `merchant_profile_key`, so reconcile
// can read each account's health even when it has no charge to check. A scan of a table with one
// row per tenant, run once an hour: it needs no index of its own.
export async function listDistinctMerchantProfileKeys(
  repo: Repository<SubscriptionEntity>,
): Promise<string[]> {
  const rows = await repo
    .createQueryBuilder('s')
    .select('s.merchantProfileKey', 'merchantProfileKey')
    .distinct(true)
    .orderBy('s.merchantProfileKey', 'ASC')
    .getRawMany<{ merchantProfileKey: string }>();
  return rows.map((row) => row.merchantProfileKey);
}

// The tenants, among those asked for, that already have a subscription row (UC-140): the self-heal
// job diffs a page of tenants Platform listed against it. It reads `UNIQUE (tenant_id)`.
export async function findExistingSubscriptionTenantIds(
  manager: EntityManager,
  tenantIds: readonly string[],
): Promise<string[]> {
  if (tenantIds.length === 0) return [];
  const rows = await manager
    .createQueryBuilder(SubscriptionEntity, 's')
    .select('s.tenantId', 'tenantId')
    .where('s.tenantId IN (:...tenantIds)', { tenantIds })
    .getRawMany<{ tenantId: string }>();
  return rows.map((row) => row.tenantId);
}
