import { Inject, Injectable } from '@nestjs/common';
import { AvailabilityAlertNotFoundError } from '../../domain/errors/availability-alert.error';
import {
  AVAILABILITY_ALERT_REPOSITORY,
  IAvailabilityAlertRepository,
} from '../ports/availability-alert-repository.port';
import {
  AvailabilityAlertResult,
  toAvailabilityAlertResult,
} from './availability-alert-input.helpers';

export interface GetAvailabilityAlertUseCaseInput {
  alertId: string;
  tenantId: string;
  customerId: string;
}

export type GetAvailabilityAlertUseCaseResult = AvailabilityAlertResult;

// UC-076: one of the caller's own alerts, whatever its status, for as long as it is retained
// (finished alerts are purged 90 days after expiry; the list holds only the 100 most recent).
// Another customer's alert (same tenant) reads as not found, exactly like another tenant's.
@Injectable()
export class GetAvailabilityAlertUseCase {
  constructor(
    @Inject(AVAILABILITY_ALERT_REPOSITORY)
    private readonly alertRepo: IAvailabilityAlertRepository,
  ) {}

  async execute(
    input: GetAvailabilityAlertUseCaseInput,
  ): Promise<GetAvailabilityAlertUseCaseResult> {
    const alert = await this.alertRepo.findById(input.alertId, input.tenantId);
    if (alert?.customerId !== input.customerId) {
      throw new AvailabilityAlertNotFoundError(input.alertId);
    }
    return toAvailabilityAlertResult(alert);
  }
}
