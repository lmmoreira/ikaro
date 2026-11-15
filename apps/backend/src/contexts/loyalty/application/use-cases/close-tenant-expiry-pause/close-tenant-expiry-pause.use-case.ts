import { Inject, Injectable } from '@nestjs/common';
import {
  ITenantExpiryPauseRepository,
  TENANT_EXPIRY_PAUSE_REPOSITORY,
} from '../../ports/tenant-expiry-pause-repository.port';

export interface CloseTenantExpiryPauseUseCaseInput {
  tenantId: string;
  /** The `suspendedAt` the `SubscriptionReactivated` event carries: the span's start and its key. */
  suspendedAt: Date;
  reactivatedAt: Date;
  correlationId: string;
}

/**
 * Closes the span during which a suspended tenant's loyalty points stopped expiring (M25-S27,
 * UC-121 O-L1). Writes the same row the suspend handler writes, so delivery order does not matter
 * and a redelivery changes nothing.
 */
@Injectable()
export class CloseTenantExpiryPauseUseCase {
  static readonly CONSUMER_NAME = 'resume-loyalty-expiry-after-suspension';

  constructor(
    @Inject(TENANT_EXPIRY_PAUSE_REPOSITORY)
    private readonly pauseRepo: ITenantExpiryPauseRepository,
  ) {}

  async execute(dto: CloseTenantExpiryPauseUseCaseInput): Promise<void> {
    await this.pauseRepo.recordClosed(dto.tenantId, dto.suspendedAt, dto.reactivatedAt);
  }
}
