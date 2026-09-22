import { ServiceBookingPolicyProps } from '../../domain/service.types';
import { ServiceEntity } from '../entities/service.entity';

// Split out of typeorm-service.mapper.ts to stay under docs/CODE_STANDARDS.md's file-length
// limit — booking-policy (M22-S02) is a self-contained field group with no dependency on the
// resource-requirements/legs/classResourceSlots mapping the rest of that file handles.

function toMoneyAmount(value: string | null): number | null {
  return value === null ? null : Number(value);
}

function toMoneyColumn(value: number | null): string | null {
  return value === null ? null : value.toFixed(2);
}

export function toBookingPolicy(entity: ServiceEntity): ServiceBookingPolicyProps {
  return {
    defaultApprovalMode: entity.defaultApprovalMode,
    manualHoldMinutes: entity.manualHoldMinutes,
    cancellationWindowHoursOverride: entity.cancellationWindowHoursOverride,
    rescheduleWindowHoursOverride: entity.rescheduleWindowHoursOverride,
    minBookingAdvanceHoursOverride: entity.minBookingAdvanceHoursOverride,
    maxBookingAdvanceDaysOverride: entity.maxBookingAdvanceDaysOverride,
    recurrenceEligible: entity.recurrenceEligible,
    availabilityAlertEligible: entity.availabilityAlertEligible,
    durationPolicy: entity.durationPolicy,
    durationMinMinutes: entity.durationMinMinutes,
    durationMaxMinutes: entity.durationMaxMinutes,
    durationIncrementMinutes: entity.durationIncrementMinutes,
    pricingPolicy: entity.pricingPolicy,
    pricingIncrementMinutes: entity.pricingIncrementMinutes,
    pricePerIncrementAmount: toMoneyAmount(entity.pricePerIncrementAmount),
    minimumChargeAmount: toMoneyAmount(entity.minimumChargeAmount),
  };
}

export function applyBookingPolicy(entity: ServiceEntity, policy: ServiceBookingPolicyProps): void {
  entity.defaultApprovalMode = policy.defaultApprovalMode;
  entity.manualHoldMinutes = policy.manualHoldMinutes;
  entity.cancellationWindowHoursOverride = policy.cancellationWindowHoursOverride;
  entity.rescheduleWindowHoursOverride = policy.rescheduleWindowHoursOverride;
  entity.minBookingAdvanceHoursOverride = policy.minBookingAdvanceHoursOverride;
  entity.maxBookingAdvanceDaysOverride = policy.maxBookingAdvanceDaysOverride;
  entity.recurrenceEligible = policy.recurrenceEligible;
  entity.availabilityAlertEligible = policy.availabilityAlertEligible;
  entity.durationPolicy = policy.durationPolicy;
  entity.durationMinMinutes = policy.durationMinMinutes;
  entity.durationMaxMinutes = policy.durationMaxMinutes;
  entity.durationIncrementMinutes = policy.durationIncrementMinutes;
  entity.pricingPolicy = policy.pricingPolicy;
  entity.pricingIncrementMinutes = policy.pricingIncrementMinutes;
  entity.pricePerIncrementAmount = toMoneyColumn(policy.pricePerIncrementAmount);
  entity.minimumChargeAmount = toMoneyColumn(policy.minimumChargeAmount);
}
