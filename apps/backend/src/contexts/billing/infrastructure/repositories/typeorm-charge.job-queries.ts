import { Repository, SelectQueryBuilder } from 'typeorm';
import type {
  OverdueChargeRef,
  PendingCreationRef,
} from '../../application/ports/charge-repository.port';
import { PROVIDER_CREATION_LEASE_MINUTES } from '../../domain/billing-constants';
import { ChargeEntity } from '../entities/charge.entity';
import { afterPendingCreation } from './typeorm-charge.sql';

// The cross-tenant job selectors of the charge repository (no tenant: ids only), each served by its
// own standalone partial index on `billing.charges`. The builders are exported so the integration
// specs can `EXPLAIN` the exact SQL that runs; the repository only adds `getRawMany()`.

const OPEN_STATUSES = ['PENDING', 'OVERDUE'];

function refQuery(repo: Repository<ChargeEntity>): SelectQueryBuilder<ChargeEntity> {
  return repo.createQueryBuilder('c').select('c.tenantId', 'tenantId').addSelect('c.id', 'id');
}

export function buildPendingCreationQuery(
  repo: Repository<ChargeEntity>,
  now: Date,
  limit: number,
  after?: PendingCreationRef,
): SelectQueryBuilder<ChargeEntity> {
  const query = refQuery(repo)
    .addSelect('c.providerCreationLastAttemptAt', 'lastAttemptAt')
    .where('c.status IN (:...statuses)', { statuses: OPEN_STATUSES })
    .andWhere(`c.providerCreationStatus = 'PENDING' AND c.providerChargeId IS NULL`)
    .andWhere(
      `(c.providerCreationLastAttemptAt IS NULL OR c.providerCreationLastAttemptAt < :cutoff)`,
      { cutoff: new Date(now.getTime() - PROVIDER_CREATION_LEASE_MINUTES * 60_000) },
    );
  if (after) query.andWhere(...afterPendingCreation(after));
  return query
    .orderBy('c.providerCreationLastAttemptAt', 'ASC', 'NULLS FIRST')
    .addOrderBy('c.id', 'ASC')
    .limit(limit);
}

export function buildOpenDueQuery(
  repo: Repository<ChargeEntity>,
  dueOnOrBefore: string,
  limit: number,
): SelectQueryBuilder<ChargeEntity> {
  return refQuery(repo)
    .where('c.status IN (:...statuses)', { statuses: OPEN_STATUSES })
    .andWhere('c.dueDate <= :dueOnOrBefore', { dueOnOrBefore })
    .orderBy('c.dueDate', 'ASC')
    .addOrderBy('c.id', 'ASC')
    .limit(limit);
}

export function buildOpenQuery(
  repo: Repository<ChargeEntity>,
  limit: number,
): SelectQueryBuilder<ChargeEntity> {
  return refQuery(repo)
    .where('c.status IN (:...statuses)', { statuses: OPEN_STATUSES })
    .orderBy('c.dueDate', 'ASC')
    .addOrderBy('c.id', 'ASC')
    .limit(limit);
}

// A flagged charge is always `CANCELED`; the status equality lets the (status, due_date) partial
// index serve the order.
export function buildProviderCancelPendingQuery(
  repo: Repository<ChargeEntity>,
  limit: number,
): SelectQueryBuilder<ChargeEntity> {
  return refQuery(repo)
    .where('c.status = :status', { status: 'CANCELED' })
    .andWhere('c.providerCancelPending = true')
    .orderBy('c.dueDate', 'ASC')
    .addOrderBy('c.id', 'ASC')
    .limit(limit);
}

/**
 * The status sweep's rule 1 selector (UC-115, M26-S06): `PENDING` charges whose payer has a
 * payment link (`provider_creation_status = 'READY'`: a charge held for a missing billing address
 * or not yet accepted by the provider is not overdue, because nobody could pay it) and whose due
 * date is on or before the caller's UTC date. Served by `IDX_billing_charges_open (status,
 * due_date) WHERE status IN ('PENDING','OVERDUE')`: `status = 'PENDING'` is a literal so the
 * planner can prove the partial index, and the `READY` filter is residual. A keyset page on
 * `(due_date, id)`, because a charge the sweep skips stays selected.
 */
export function buildOverdueCandidatesQuery(
  repo: Repository<ChargeEntity>,
  dueOnOrBefore: string,
  limit: number,
  after?: OverdueChargeRef,
): SelectQueryBuilder<ChargeEntity> {
  const query = refQuery(repo)
    // A raw `date` column is not turned into the entity's string here, so it is cast.
    .addSelect('CAST(c.dueDate AS text)', 'dueDate')
    .where("c.status = 'PENDING'")
    .andWhere("c.providerCreationStatus = 'READY'")
    .andWhere('c.dueDate <= :dueOnOrBefore', { dueOnOrBefore });
  if (after) {
    query.andWhere('(c.dueDate, c.id) > (:afterDate, :afterId)', {
      afterDate: after.dueDate,
      afterId: after.id,
    });
  }
  return query.orderBy('c.dueDate', 'ASC').addOrderBy('c.id', 'ASC').limit(limit);
}
