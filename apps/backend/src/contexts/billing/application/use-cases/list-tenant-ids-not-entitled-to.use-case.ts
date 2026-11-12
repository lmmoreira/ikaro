import { Inject, Injectable } from '@nestjs/common';
import type { FeatureKey } from '@ikaro/validation';
import { CLOCK, type IClock } from '../../../../shared/ports/clock.port';
import {
  type ISubscriptionRepository,
  SUBSCRIPTION_REPOSITORY,
} from '../ports/subscription-repository.port';

export interface ListTenantIdsNotEntitledToUseCaseInput {
  feature: FeatureKey;
}

export interface ListTenantIdsNotEntitledToUseCaseResult {
  tenantIds: string[];
}

/**
 * UC-120 A4: what a cron needs to skip tenants without an entitlement. Operational tenants that
 * are not on a trial (a trial grants every feature) and have no active item for the feature. It
 * reads Billing's own tables only and returns ids, never another tenant's state.
 */
@Injectable()
export class ListTenantIdsNotEntitledToUseCase {
  constructor(
    @Inject(SUBSCRIPTION_REPOSITORY) private readonly subscriptions: ISubscriptionRepository,
    @Inject(CLOCK) private readonly clock: IClock,
  ) {}

  async execute(
    input: ListTenantIdsNotEntitledToUseCaseInput,
  ): Promise<ListTenantIdsNotEntitledToUseCaseResult> {
    return {
      tenantIds: await this.subscriptions.findTenantIdsNotEntitledTo(
        input.feature,
        this.clock.now(),
      ),
    };
  }
}
