import { Inject, Injectable } from '@nestjs/common';
import {
  type ISubscriptionRepository,
  SUBSCRIPTION_REPOSITORY,
} from '../ports/subscription-repository.port';

export interface ListSuspendedTenantIdsUseCaseResult {
  tenantIds: string[];
}

/** UC-120 A4: the batch read for the rare cross-tenant scan. Ids only. */
@Injectable()
export class ListSuspendedTenantIdsUseCase {
  constructor(
    @Inject(SUBSCRIPTION_REPOSITORY) private readonly subscriptions: ISubscriptionRepository,
  ) {}

  async execute(): Promise<ListSuspendedTenantIdsUseCaseResult> {
    return { tenantIds: await this.subscriptions.listSuspendedTenantIds() };
  }
}
