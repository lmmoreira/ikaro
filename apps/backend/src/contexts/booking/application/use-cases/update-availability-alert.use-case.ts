import { Inject, Injectable } from '@nestjs/common';
import {
  ITransactionManager,
  TRANSACTION_MANAGER,
} from '../../../../shared/ports/transaction-manager.port';
import { AvailabilityAlert } from '../../domain/availability-alert.aggregate';
import { AvailabilityAlertNotFoundError } from '../../domain/errors/availability-alert.error';
import { BookingServiceNotInTenantError } from '../../domain/errors/booking-domain.error';
import {
  AVAILABILITY_ALERT_REPOSITORY,
  IAvailabilityAlertRepository,
} from '../ports/availability-alert-repository.port';
import { IResourceRepository, RESOURCE_REPOSITORY } from '../ports/resource-repository.port';
import { IServiceRepository, SERVICE_REPOSITORY } from '../ports/service-repository.port';
import {
  assertPreferredResourceEligible,
  AvailabilityAlertCriteriaFields,
  AvailabilityAlertResult,
  hasCriteriaFields,
  toAvailabilityAlertResult,
  toCriteriaPatch,
} from './availability-alert-input.helpers';

export interface UpdateAvailabilityAlertUseCaseInput extends AvailabilityAlertCriteriaFields {
  alertId: string;
  tenantId: string;
  correlationId: string;
  customerId: string;
  preferredResourceId?: string | null;
  durationMinutes?: number | null;
  participantCount?: number | null;
  expiresAt?: string;
}

export type UpdateAvailabilityAlertUseCaseResult = AvailabilityAlertResult;

// UC-076: edits the criteria, resource preference, numeric criteria or expiry of the caller's own
// ACTIVE alert. The aggregate re-validates the merged result and refuses a non-ACTIVE alert.
@Injectable()
export class UpdateAvailabilityAlertUseCase {
  constructor(
    @Inject(AVAILABILITY_ALERT_REPOSITORY)
    private readonly alertRepo: IAvailabilityAlertRepository,
    @Inject(SERVICE_REPOSITORY) private readonly serviceRepo: IServiceRepository,
    @Inject(RESOURCE_REPOSITORY) private readonly resourceRepo: IResourceRepository,
    @Inject(TRANSACTION_MANAGER) private readonly txManager: ITransactionManager,
  ) {}

  async execute(
    input: UpdateAvailabilityAlertUseCaseInput,
  ): Promise<UpdateAvailabilityAlertUseCaseResult> {
    // Another customer's alert (same tenant) reads as not found, exactly like another tenant's.
    const alert = await this.alertRepo.findById(input.alertId, input.tenantId);
    if (alert?.customerId !== input.customerId) {
      throw new AvailabilityAlertNotFoundError(input.alertId);
    }
    await this.assertPreferredResource(alert, input);

    alert.update(
      {
        ...(hasCriteriaFields(input) && { criteria: toCriteriaPatch(input) }),
        ...(input.preferredResourceId !== undefined && {
          preferredResourceId: input.preferredResourceId,
        }),
        ...(input.durationMinutes !== undefined && { durationMinutes: input.durationMinutes }),
        ...(input.participantCount !== undefined && { participantCount: input.participantCount }),
        ...(input.expiresAt !== undefined && { expiresAt: new Date(input.expiresAt) }),
      },
      input.correlationId,
    );
    await this.txManager.run(() => this.alertRepo.save(alert));
    return toAvailabilityAlertResult(alert);
  }

  private async assertPreferredResource(
    alert: AvailabilityAlert,
    input: UpdateAvailabilityAlertUseCaseInput,
  ): Promise<void> {
    if (!input.preferredResourceId) return;
    const service = await this.serviceRepo.findById(alert.serviceId, input.tenantId);
    if (!service) throw new BookingServiceNotInTenantError(alert.serviceId);
    const resource = await this.resourceRepo.findById(input.preferredResourceId, input.tenantId);
    assertPreferredResourceEligible(service, resource);
  }
}
