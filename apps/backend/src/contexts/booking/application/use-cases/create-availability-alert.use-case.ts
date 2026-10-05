import { Inject, Injectable } from '@nestjs/common';
import {
  ITransactionManager,
  TRANSACTION_MANAGER,
} from '../../../../shared/ports/transaction-manager.port';
import {
  ALERT_ACTIVE_CAP_PER_CUSTOMER,
  AvailabilityAlert,
} from '../../domain/availability-alert.aggregate';
import {
  AvailabilityAlertCapReachedError,
  AvailabilityAlertIneligibleServiceError,
} from '../../domain/errors/availability-alert.error';
import {
  BookingServiceNotActiveError,
  BookingServiceNotInTenantError,
} from '../../domain/errors/booking-domain.error';
import {
  AVAILABILITY_ALERT_REPOSITORY,
  IAvailabilityAlertRepository,
} from '../ports/availability-alert-repository.port';
import { IResourceRepository, RESOURCE_REPOSITORY } from '../ports/resource-repository.port';
import { IServiceRepository, SERVICE_REPOSITORY } from '../ports/service-repository.port';
import { ITenantLockPort, TENANT_LOCK_PORT } from '../ports/tenant-lock.port';
import {
  assertPreferredResourceEligible,
  AvailabilityAlertCriteriaFields,
  AvailabilityAlertResult,
  toAvailabilityAlertResult,
  toCriteriaPatch,
} from './availability-alert-input.helpers';

export interface CreateAvailabilityAlertUseCaseInput extends AvailabilityAlertCriteriaFields {
  tenantId: string;
  correlationId: string;
  customerId: string;
  // The tenant's timezone — never client-supplied.
  timezone: string;
  serviceId: string;
  criteriaType: 'ONE_TIME_RANGE' | 'WEEKLY_PREFERENCE';
  preferredResourceId?: string | null;
  durationMinutes?: number | null;
  participantCount?: number | null;
  expiresAt?: string;
}

export type CreateAvailabilityAlertUseCaseResult = AvailabilityAlertResult;

// UC-072: stores an expiring intent for the authenticated customer. Nothing is reserved.
@Injectable()
export class CreateAvailabilityAlertUseCase {
  constructor(
    @Inject(SERVICE_REPOSITORY) private readonly serviceRepo: IServiceRepository,
    @Inject(RESOURCE_REPOSITORY) private readonly resourceRepo: IResourceRepository,
    @Inject(AVAILABILITY_ALERT_REPOSITORY)
    private readonly alertRepo: IAvailabilityAlertRepository,
    @Inject(TENANT_LOCK_PORT) private readonly tenantLock: ITenantLockPort,
    @Inject(TRANSACTION_MANAGER) private readonly txManager: ITransactionManager,
  ) {}

  async execute(
    input: CreateAvailabilityAlertUseCaseInput,
  ): Promise<CreateAvailabilityAlertUseCaseResult> {
    // The save() call must stay textually inside this callback — architecture-check's
    // transactional-save detector requires it. The customer lock serializes the cap's
    // count-then-insert against a concurrent create by the same customer (no row exists yet, so
    // an advisory lock is the right primitive); the service row lock means an eligibility change
    // either commits first and is seen here, or waits for this transaction.
    const alert = await this.txManager.run(async () => {
      await this.tenantLock.lockCustomerAlerts(input.tenantId, input.customerId);
      await this.assertServiceAndResource(input);
      const active = await this.alertRepo.countActiveByCustomer(input.tenantId, input.customerId);
      if (active >= ALERT_ACTIVE_CAP_PER_CUSTOMER) {
        throw new AvailabilityAlertCapReachedError(ALERT_ACTIVE_CAP_PER_CUSTOMER);
      }
      const created = AvailabilityAlert.create({
        tenantId: input.tenantId,
        customerId: input.customerId,
        serviceId: input.serviceId,
        preferredResourceId: input.preferredResourceId ?? null,
        timezone: input.timezone,
        criteria: { ...toCriteriaPatch(input), criteriaType: input.criteriaType },
        durationMinutes: input.durationMinutes ?? null,
        participantCount: input.participantCount ?? null,
        expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
        correlationId: input.correlationId,
      });
      await this.alertRepo.save(created);
      return created;
    });
    return toAvailabilityAlertResult(alert);
  }

  private async assertServiceAndResource(
    input: CreateAvailabilityAlertUseCaseInput,
  ): Promise<void> {
    const service = await this.serviceRepo.findByIdForUpdate(input.serviceId, input.tenantId);
    if (!service) throw new BookingServiceNotInTenantError(input.serviceId);
    if (!service.isActive) throw new BookingServiceNotActiveError(input.serviceId);
    if (!service.bookingPolicy.availabilityAlertEligible) {
      throw new AvailabilityAlertIneligibleServiceError();
    }
    if (input.preferredResourceId) {
      const resource = await this.resourceRepo.findById(input.preferredResourceId, input.tenantId);
      assertPreferredResourceEligible(service, resource);
    }
  }
}
