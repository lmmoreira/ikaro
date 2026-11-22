import { Repository } from 'typeorm';
import type { SweepDueRef } from '../../application/ports/subscription-repository.port';
import { SubscriptionEntity } from '../entities/subscription.entity';
import {
  buildCancelDueQuery,
  buildGraceExpiredQuery,
  buildTrialEndedQuery,
  buildTrialEndingQuery,
} from './typeorm-subscription.sweep-queries';

/**
 * The cross-tenant job selectors of the subscription repository that the status sweep (UC-115,
 * M26-S06) and the dunning reminders (UC-139, M26-S09) page through: ids and instants only, each
 * running one of the query builders in `typeorm-subscription.sweep-queries`, which the integration
 * spec `EXPLAIN`s. They live apart from the aggregate's own reads and writes so neither file grows
 * past its reason to change; the repository extends this class and so is the one
 * `ISubscriptionRepository` the jobs inject (the same shape as `ChargeJobSelectors`).
 */
export abstract class SubscriptionSweepSelectors {
  protected constructor(protected readonly repo: Repository<SubscriptionEntity>) {}

  findTrialEndedForJob(now: Date, limit: number, after?: SweepDueRef): Promise<SweepDueRef[]> {
    return buildTrialEndedQuery(this.repo, now, limit, after).getRawMany<SweepDueRef>();
  }

  findTrialEndingForJob(
    from: Date,
    to: Date,
    limit: number,
    after?: SweepDueRef,
  ): Promise<SweepDueRef[]> {
    return buildTrialEndingQuery(this.repo, from, to, limit, after).getRawMany<SweepDueRef>();
  }

  findGraceExpiredForJob(now: Date, limit: number, after?: SweepDueRef): Promise<SweepDueRef[]> {
    return buildGraceExpiredQuery(this.repo, now, limit, after).getRawMany<SweepDueRef>();
  }

  findCancelDueForJob(now: Date, limit: number, after?: SweepDueRef): Promise<SweepDueRef[]> {
    return buildCancelDueQuery(this.repo, now, limit, after).getRawMany<SweepDueRef>();
  }
}
