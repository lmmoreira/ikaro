import { Money } from '../../../shared/value-objects/money';
import { ClassResourceSlot } from './class-resource-slot';
import { ActiveResourceIdsByType, ServiceBookingModel } from './resource-requirement-availability';
import { ResourceRequirement } from './resource-requirement';
import { ServiceLeg } from './service-leg';

// Split out of service.aggregate.ts to stay under docs/CODE_STANDARDS.md's file-length limit —
// pure type/interface declarations, no logic, so the split carries no behavioral risk.
// ServiceBookingModel itself is re-exported here (canonical definition lives in
// resource-requirement-availability.ts) so existing call sites can keep importing it from either
// this file or service.aggregate.ts.
export type { ServiceBookingModel };

// M22-S02 — booking-policy fields (UC-055). APPOINTMENT only; every override field is null on a
// SESSION service and inherits the matching tenant/platform default when null on an APPOINTMENT
// one — see docs/02-DOMAIN_MODEL.md's own field-by-field inheritance notes.
export type ServiceApprovalMode = 'AUTO_CONFIRM' | 'MANUAL_APPROVAL';
export type ServiceDurationPolicy = 'FIXED' | 'CUSTOMER_SELECTED';
export type ServicePricingPolicy = 'FIXED' | 'PER_TIME_INCREMENT';

export interface ServiceBookingPolicyProps {
  defaultApprovalMode: ServiceApprovalMode | null;
  manualHoldMinutes: number | null;
  cancellationWindowHoursOverride: number | null;
  rescheduleWindowHoursOverride: number | null;
  minBookingAdvanceHoursOverride: number | null;
  maxBookingAdvanceDaysOverride: number | null;
  recurrenceEligible: boolean;
  availabilityAlertEligible: boolean;
  durationPolicy: ServiceDurationPolicy;
  durationMinMinutes: number | null;
  durationMaxMinutes: number | null;
  durationIncrementMinutes: number | null;
  pricingPolicy: ServicePricingPolicy;
  pricingIncrementMinutes: number | null;
  pricePerIncrementAmount: number | null;
  minimumChargeAmount: number | null;
}

// The DB-documented defaults (docs/13-DATABASE_SCHEMA.md § booking.services — modified) — every
// override/duration/pricing field starts unset on service creation; only set via
// PATCH /services/:id/booking-policy (UC-055).
export function defaultServiceBookingPolicyProps(): ServiceBookingPolicyProps {
  return {
    defaultApprovalMode: null,
    manualHoldMinutes: null,
    cancellationWindowHoursOverride: null,
    rescheduleWindowHoursOverride: null,
    minBookingAdvanceHoursOverride: null,
    maxBookingAdvanceDaysOverride: null,
    recurrenceEligible: false,
    availabilityAlertEligible: false,
    durationPolicy: 'FIXED',
    durationMinMinutes: null,
    durationMaxMinutes: null,
    durationIncrementMinutes: null,
    pricingPolicy: 'FIXED',
    pricingIncrementMinutes: null,
    pricePerIncrementAmount: null,
    minimumChargeAmount: null,
  };
}

export interface ServiceProps {
  id: string;
  tenantId: string;
  name: string;
  description: string | null;
  price: Money;
  durationMinutes: number;
  loyaltyPointsValue: number;
  requiresPickupAddress: boolean;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  bookingModel: ServiceBookingModel;
  resourceRequirements: ResourceRequirement[];
  bufferAfterMinutes: number | null;
  legs: ServiceLeg[] | null;
  classResourceSlots: ClassResourceSlot[] | null;
  bookingPolicy: ServiceBookingPolicyProps;
}

export interface CreateServiceProps {
  tenantId: string;
  name: string;
  price: Money;
  durationMinutes: number;
  loyaltyPointsValue: number;
  requiresPickupAddress?: boolean;
  isActive?: boolean;
  description?: string;
  bookingModel?: ServiceBookingModel;
  // Tenant's current settings.serviceBufferMinutes, snapshotted by the caller at creation time
  // (UC-053 step 1). Ignored for a SESSION service.
  tenantServiceBufferMinutes?: number | null;
  classResourceSlots?: ClassResourceSlot[];
  // Resolved by the caller (IResourceRepository.findByTenant) — required whenever
  // classResourceSlots is non-empty; ignored otherwise. See setResourceRequirements()/setLegs()'s
  // identical parameter for why this lives outside the aggregate.
  activeResourceIdsByType?: ActiveResourceIdsByType;
}
