import { Inject, Injectable } from '@nestjs/common';
import {
  ITenantExpiryPauseRepository,
  TENANT_EXPIRY_PAUSE_REPOSITORY,
} from '../../ports/tenant-expiry-pause-repository.port';

export interface RecordTenantExpiryPauseUseCaseInput {
  tenantId: string;
  /** The `suspendedAt` of the `SubscriptionSuspended` event: the span's start and its key. */
  suspendedAt: Date;
  correlationId: string;
}

/**
 * Opens the span during which a suspended tenant's loyalty points stop expiring (M25-S27, UC-121
 * O-L1). Idempotent: the span is keyed by its start, so a redelivery, or a suspend event arriving
 * after the reactivation already closed the span, writes nothing.
 */
@Injectable()
export class RecordTenantExpiryPauseUseCase {
  static readonly CONSUMER_NAME = 'pause-loyalty-expiry-on-suspension';

  constructor(
    @Inject(TENANT_EXPIRY_PAUSE_REPOSITORY)
    private readonly pauseRepo: ITenantExpiryPauseRepository,
  ) {}

  async execute(dto: RecordTenantExpiryPauseUseCaseInput): Promise<void> {
    await this.pauseRepo.recordOpen(dto.tenantId, dto.suspendedAt);
  }
}
