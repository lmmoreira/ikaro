import { Repository } from 'typeorm';
import type {
  DueChargeRef,
  OverdueChargeRef,
  PaidChargeRef,
  PendingCreationRef,
  RecoveryChargeRef,
} from '../../application/ports/charge-repository.port';
import { ChargeEntity } from '../entities/charge.entity';
import {
  buildOverdueCandidatesQuery,
  buildPendingCreationQuery,
} from './typeorm-charge.job-queries';
import {
  buildOpenDueBetweenQuery,
  buildOpenDueQuery,
  buildOpenQuery,
  buildOpenRecoveryQuery,
  buildOpenTrialChargesQuery,
  buildProviderCancelPendingQuery,
  buildRecentlyPaidQuery,
} from './typeorm-charge.reconcile-queries';

/**
 * The cross-tenant job selectors of the charge repository (no tenant: ids only), each running one
 * of the exported query builders, which the integration specs `EXPLAIN`. They live apart from the
 * aggregate's own reads and writes so neither file grows past its reason to change; the repository
 * extends this class and so is the one `IChargeRepository` the jobs inject.
 */
export abstract class ChargeJobSelectors {
  protected constructor(protected readonly repo: Repository<ChargeEntity>) {}

  async listPendingCreationForJob(
    now: Date,
    limit: number,
    after?: PendingCreationRef,
  ): Promise<PendingCreationRef[]> {
    return buildPendingCreationQuery(this.repo, now, limit, after).getRawMany<PendingCreationRef>();
  }

  listOverdueCandidatesForJob(
    dueOnOrBefore: string,
    limit: number,
    after?: OverdueChargeRef,
  ): Promise<OverdueChargeRef[]> {
    return buildOverdueCandidatesQuery(
      this.repo,
      dueOnOrBefore,
      limit,
      after,
    ).getRawMany<OverdueChargeRef>();
  }

  listOpenDueForJob(due: string, limit: number, after?: DueChargeRef): Promise<DueChargeRef[]> {
    return buildOpenDueQuery(this.repo, due, limit, after).getRawMany<DueChargeRef>();
  }

  listOpenDueBetweenForJob(
    fromDate: string,
    toDate: string,
    limit: number,
    after?: DueChargeRef,
  ): Promise<DueChargeRef[]> {
    return buildOpenDueBetweenQuery(
      this.repo,
      fromDate,
      toDate,
      limit,
      after,
    ).getRawMany<DueChargeRef>();
  }

  listOpenForJob(limit: number, after?: DueChargeRef): Promise<DueChargeRef[]> {
    return buildOpenQuery(this.repo, limit, after).getRawMany<DueChargeRef>();
  }

  listOpenRecoveryForJob(limit: number, after?: RecoveryChargeRef): Promise<RecoveryChargeRef[]> {
    return buildOpenRecoveryQuery(this.repo, limit, after).getRawMany<RecoveryChargeRef>();
  }

  listOpenTrialChargesForJob(
    endsBefore: Date,
    limit: number,
    after?: DueChargeRef,
  ): Promise<DueChargeRef[]> {
    return buildOpenTrialChargesQuery(this.repo, endsBefore, limit, after).getRawMany();
  }

  listRecentlyPaidForJob(
    since: Date,
    limit: number,
    after?: PaidChargeRef,
  ): Promise<PaidChargeRef[]> {
    return buildRecentlyPaidQuery(this.repo, since, limit, after).getRawMany<PaidChargeRef>();
  }

  listProviderCancelPendingForJob(limit: number, after?: DueChargeRef): Promise<DueChargeRef[]> {
    return buildProviderCancelPendingQuery(this.repo, limit, after).getRawMany<DueChargeRef>();
  }
}
