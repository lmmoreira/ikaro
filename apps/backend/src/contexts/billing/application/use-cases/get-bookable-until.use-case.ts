import { Inject, Injectable } from '@nestjs/common';
import { CLOCK, type IClock } from '../../../../shared/ports/clock.port';
import {
  type ISubscriptionRepository,
  SUBSCRIPTION_REPOSITORY,
} from '../ports/subscription-repository.port';

export interface GetBookableUntilUseCaseInput {
  tenantId: string;
}

export interface GetBookableUntilUseCaseResult {
  bookableUntil: string | null;
}

/**
 * M26-S18b: the authoritative, uncached BOOKING cap Booking reads inside the write transaction.
 * It goes through `findFreshByTenantId` (never `CachingSubscriptionRepository`'s cache), so a
 * second instance holding a stale cached access answer still sees a removal saved a moment ago.
 * A failed read propagates: the write path must not accept a commitment it could not check.
 */
@Injectable()
export class GetBookableUntilUseCase {
  constructor(
    @Inject(SUBSCRIPTION_REPOSITORY) private readonly subscriptions: ISubscriptionRepository,
    @Inject(CLOCK) private readonly clock: IClock,
  ) {}

  async execute(input: GetBookableUntilUseCaseInput): Promise<GetBookableUntilUseCaseResult> {
    const subscription = await this.subscriptions.findFreshByTenantId(input.tenantId);
    return { bookableUntil: subscription?.bookableUntil(this.clock.now()) ?? null };
  }
}
