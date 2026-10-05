import { Inject, Injectable } from '@nestjs/common';
import {
  AVAILABILITY_ALERT_REPOSITORY,
  IAvailabilityAlertRepository,
} from '../ports/availability-alert-repository.port';
import {
  AvailabilityAlertResult,
  toAvailabilityAlertResult,
} from './availability-alert-input.helpers';

// The most recent alerts returned, history included. The per-customer cap bounds the active ones;
// the rest is read-only history (UC-076 A1), so a fixed ceiling keeps the list bounded.
export const LIST_AVAILABILITY_ALERTS_LIMIT = 100;

export interface ListAvailabilityAlertsUseCaseInput {
  tenantId: string;
  customerId: string;
}

export interface ListAvailabilityAlertsUseCaseResult {
  items: AvailabilityAlertResult[];
}

// UC-076: "Meus avisos" — the caller's own alerts, newest first.
@Injectable()
export class ListAvailabilityAlertsUseCase {
  constructor(
    @Inject(AVAILABILITY_ALERT_REPOSITORY)
    private readonly alertRepo: IAvailabilityAlertRepository,
  ) {}

  async execute(
    input: ListAvailabilityAlertsUseCaseInput,
  ): Promise<ListAvailabilityAlertsUseCaseResult> {
    const alerts = await this.alertRepo.findByCustomer(
      input.tenantId,
      input.customerId,
      LIST_AVAILABILITY_ALERTS_LIMIT,
    );
    return { items: alerts.map(toAvailabilityAlertResult) };
  }
}
