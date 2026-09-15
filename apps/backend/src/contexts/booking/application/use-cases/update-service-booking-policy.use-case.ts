import { Inject, Injectable } from '@nestjs/common';
import {
  ITransactionManager,
  TRANSACTION_MANAGER,
} from '../../../../shared/ports/transaction-manager.port';
import { ServiceNotFoundError } from '../../domain/errors/booking-domain.error';
import { ServiceBookingPolicyProps } from '../../domain/service.types';
import { UpdateServiceBookingPolicyDto } from '../dtos/update-service-booking-policy.dto';
import { BOOKING_PLATFORM_PORT, IBookingPlatformPort } from '../ports/booking-platform.port';
import { IServiceRepository, SERVICE_REPOSITORY } from '../ports/service-repository.port';
import { resolveApprovalMode } from './service-result.mapper';

export type UpdateServiceBookingPolicyUseCaseInput = UpdateServiceBookingPolicyDto & {
  id: string;
  tenantId: string;
};

export interface UpdateServiceBookingPolicyUseCaseResult {
  id: string;
  bookingPolicy: ServiceBookingPolicyProps;
}

// Every override/duration/pricing field is independently PATCH-resolved: omitted (undefined) in
// the request keeps the current value, an explicit value (including null on a nullable field)
// replaces it — mirrors update-service.use-case.ts's description field resolution.
function resolveNullable<T>(input: T | null | undefined, current: T | null): T | null {
  return input === undefined ? current : input;
}

@Injectable()
export class UpdateServiceBookingPolicyUseCase {
  constructor(
    @Inject(SERVICE_REPOSITORY) private readonly serviceRepo: IServiceRepository,
    @Inject(BOOKING_PLATFORM_PORT) private readonly bookingPlatform: IBookingPlatformPort,
    @Inject(TRANSACTION_MANAGER) private readonly txManager: ITransactionManager,
  ) {}

  async execute(
    input: UpdateServiceBookingPolicyUseCaseInput,
  ): Promise<UpdateServiceBookingPolicyUseCaseResult> {
    const { id, tenantId } = input;

    const service = await this.txManager.run(async () => {
      // findByIdForUpdate — closes the lost-update race between two concurrent Service
      // configuration writes (see update-service-resource-requirements.use-case.ts's identical
      // comment).
      const current = await this.serviceRepo.findByIdForUpdate(id, tenantId);
      if (!current) throw new ServiceNotFoundError(id);

      current.setBookingPolicy(this.resolvePolicy(current.bookingPolicy, input));
      await this.serviceRepo.save(current);
      return current;
    });

    await this.bookingPlatform.revalidatePublicPages(tenantId);

    // M22-S02: a null defaultApprovalMode inherits settings.booking.autoApproveEnabled — resolved
    // on read, never persisted onto the service row.
    const autoApproveEnabled = await this.bookingPlatform.getAutoApproveEnabled(tenantId);
    return {
      id: service.id,
      bookingPolicy: resolveApprovalMode(service.bookingPolicy, autoApproveEnabled),
    };
  }

  // Split out of execute() to stay under docs/CODE_STANDARDS.md's function-length limit.
  private resolvePolicy(
    current: ServiceBookingPolicyProps,
    input: UpdateServiceBookingPolicyDto,
  ): ServiceBookingPolicyProps {
    return {
      ...this.resolveApprovalAndWindows(current, input),
      ...this.resolveDurationAndPricing(current, input),
    };
  }

  // Split out of resolvePolicy() to stay under docs/CODE_STANDARDS.md's function-length limit.
  private resolveApprovalAndWindows(
    current: ServiceBookingPolicyProps,
    input: UpdateServiceBookingPolicyDto,
  ): Pick<
    ServiceBookingPolicyProps,
    | 'defaultApprovalMode'
    | 'manualHoldMinutes'
    | 'cancellationWindowHoursOverride'
    | 'rescheduleWindowHoursOverride'
    | 'minBookingAdvanceHoursOverride'
    | 'maxBookingAdvanceDaysOverride'
    | 'recurrenceEligible'
    | 'availabilityAlertEligible'
  > {
    return {
      defaultApprovalMode: resolveNullable(input.defaultApprovalMode, current.defaultApprovalMode),
      manualHoldMinutes: resolveNullable(input.manualHoldMinutes, current.manualHoldMinutes),
      cancellationWindowHoursOverride: resolveNullable(
        input.cancellationWindowHoursOverride,
        current.cancellationWindowHoursOverride,
      ),
      rescheduleWindowHoursOverride: resolveNullable(
        input.rescheduleWindowHoursOverride,
        current.rescheduleWindowHoursOverride,
      ),
      minBookingAdvanceHoursOverride: resolveNullable(
        input.minBookingAdvanceHoursOverride,
        current.minBookingAdvanceHoursOverride,
      ),
      maxBookingAdvanceDaysOverride: resolveNullable(
        input.maxBookingAdvanceDaysOverride,
        current.maxBookingAdvanceDaysOverride,
      ),
      recurrenceEligible: input.recurrenceEligible ?? current.recurrenceEligible,
      availabilityAlertEligible:
        input.availabilityAlertEligible ?? current.availabilityAlertEligible,
    };
  }

  // Split out of resolvePolicy() to stay under docs/CODE_STANDARDS.md's function-length limit.
  private resolveDurationAndPricing(
    current: ServiceBookingPolicyProps,
    input: UpdateServiceBookingPolicyDto,
  ): Pick<
    ServiceBookingPolicyProps,
    | 'durationPolicy'
    | 'durationMinMinutes'
    | 'durationMaxMinutes'
    | 'durationIncrementMinutes'
    | 'pricingPolicy'
    | 'pricingIncrementMinutes'
    | 'pricePerIncrementAmount'
    | 'minimumChargeAmount'
  > {
    return {
      durationPolicy: input.durationPolicy ?? current.durationPolicy,
      durationMinMinutes: resolveNullable(input.durationMinMinutes, current.durationMinMinutes),
      durationMaxMinutes: resolveNullable(input.durationMaxMinutes, current.durationMaxMinutes),
      durationIncrementMinutes: resolveNullable(
        input.durationIncrementMinutes,
        current.durationIncrementMinutes,
      ),
      pricingPolicy: input.pricingPolicy ?? current.pricingPolicy,
      pricingIncrementMinutes: resolveNullable(
        input.pricingIncrementMinutes,
        current.pricingIncrementMinutes,
      ),
      pricePerIncrementAmount: resolveNullable(
        input.pricePerIncrementAmount,
        current.pricePerIncrementAmount,
      ),
      minimumChargeAmount: resolveNullable(input.minimumChargeAmount, current.minimumChargeAmount),
    };
  }
}
