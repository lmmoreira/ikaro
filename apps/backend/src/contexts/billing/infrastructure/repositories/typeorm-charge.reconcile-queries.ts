import { Repository, SelectQueryBuilder } from 'typeorm';
import type {
  DueChargeRef,
  PaidChargeRef,
  RecoveryChargeRef,
} from '../../application/ports/charge-repository.port';
import { ChargeEntity } from '../entities/charge.entity';
import { SubscriptionEntity } from '../entities/subscription.entity';

// The reconcile selectors of the charge repository (UC-116, M26-S07): cross-tenant, ids only, each
// served by its own standalone partial index and paged by keyset in that index's order. The
// builders are exported so the integration specs can `EXPLAIN` the exact SQL that runs; the
// repository only adds `getRawMany()`. A partial index is only used when the query repeats its
// predicate literally, so the statuses below are literals, not parameters.

function refQuery(repo: Repository<ChargeEntity>): SelectQueryBuilder<ChargeEntity> {
  return repo.createQueryBuilder('c').select('c.tenantId', 'tenantId').addSelect('c.id', 'id');
}

// A raw `date` column is not turned into the entity's string here, so it is cast.
function dueRefQuery(repo: Repository<ChargeEntity>): SelectQueryBuilder<ChargeEntity> {
  return refQuery(repo).addSelect('CAST(c.dueDate AS text)', 'dueDate');
}

function pageByDue(
  query: SelectQueryBuilder<ChargeEntity>,
  limit: number,
  after?: DueChargeRef,
): SelectQueryBuilder<ChargeEntity> {
  if (after) {
    query.andWhere('(c.dueDate, c.id) > (:afterDate, :afterId)', {
      afterDate: after.dueDate,
      afterId: after.id,
    });
  }
  return query.orderBy('c.dueDate', 'ASC').addOrderBy('c.id', 'ASC').limit(limit);
}

export function buildOpenDueQuery(
  repo: Repository<ChargeEntity>,
  dueOnOrBefore: string,
  limit: number,
  after?: DueChargeRef,
): SelectQueryBuilder<ChargeEntity> {
  const query = dueRefQuery(repo)
    .where("c.status IN ('PENDING','OVERDUE')")
    .andWhere('c.dueDate <= :dueOnOrBefore', { dueOnOrBefore });
  return pageByDue(query, limit, after);
}

export function buildOpenQuery(
  repo: Repository<ChargeEntity>,
  limit: number,
  after?: DueChargeRef,
): SelectQueryBuilder<ChargeEntity> {
  return pageByDue(dueRefQuery(repo).where("c.status IN ('PENDING','OVERDUE')"), limit, after);
}

// The index is `(tenant_id, subscription_id) WHERE kind = 'RECOVERY' AND status IN (...)`: unique,
// so the pair is the whole key and no id tiebreak is needed.
export function buildOpenRecoveryQuery(
  repo: Repository<ChargeEntity>,
  limit: number,
  after?: RecoveryChargeRef,
): SelectQueryBuilder<ChargeEntity> {
  const query = refQuery(repo)
    .addSelect('c.subscriptionId', 'subscriptionId')
    .where("c.kind = 'RECOVERY'")
    .andWhere("c.status IN ('PENDING','OVERDUE')");
  if (after) {
    query.andWhere('(c.tenantId, c.subscriptionId) > (:afterTenantId, :afterSubscriptionId)', {
      afterTenantId: after.tenantId,
      afterSubscriptionId: after.subscriptionId,
    });
  }
  return query.orderBy('c.tenantId', 'ASC').addOrderBy('c.subscriptionId', 'ASC').limit(limit);
}

// The trial index narrows the subscriptions (`status = 'TRIALING'` repeats its predicate); each
// one's open charge is then found through the charge's `(tenant_id, subscription_id, ...)` index.
export function buildOpenTrialChargesQuery(
  repo: Repository<ChargeEntity>,
  trialEndsOnOrBefore: Date,
  limit: number,
  after?: DueChargeRef,
): SelectQueryBuilder<ChargeEntity> {
  const query = dueRefQuery(repo)
    .innerJoin(SubscriptionEntity, 's', 's.tenantId = c.tenantId AND s.id = c.subscriptionId')
    .where("s.status = 'TRIALING'")
    .andWhere('s.trialEndsAt <= :trialEndsOnOrBefore', { trialEndsOnOrBefore })
    .andWhere("c.kind = 'PERIOD'")
    .andWhere("c.status IN ('PENDING','OVERDUE')");
  return pageByDue(query, limit, after);
}

export function buildRecentlyPaidQuery(
  repo: Repository<ChargeEntity>,
  paidSince: Date,
  limit: number,
  after?: PaidChargeRef,
): SelectQueryBuilder<ChargeEntity> {
  const query = refQuery(repo)
    .addSelect('c.paidAt', 'paidAt')
    .where("c.status = 'PAID'")
    .andWhere('c.paidAt >= :paidSince', { paidSince });
  if (after) {
    query.andWhere('(c.paidAt, c.id) > (:afterPaidAt, :afterId)', {
      afterPaidAt: after.paidAt,
      afterId: after.id,
    });
  }
  return query.orderBy('c.paidAt', 'ASC').addOrderBy('c.id', 'ASC').limit(limit);
}

// A flagged charge is always `CANCELED`; the status equality lets the (status, due_date) partial
// index serve the order.
export function buildProviderCancelPendingQuery(
  repo: Repository<ChargeEntity>,
  limit: number,
  after?: DueChargeRef,
): SelectQueryBuilder<ChargeEntity> {
  const query = dueRefQuery(repo)
    .where("c.status = 'CANCELED'")
    .andWhere('c.providerCancelPending = true');
  return pageByDue(query, limit, after);
}
