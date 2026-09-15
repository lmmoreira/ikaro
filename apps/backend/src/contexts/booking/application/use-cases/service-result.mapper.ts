import { ClassResourceSlot } from '../../domain/class-resource-slot';
import { ResourceRequirementProps } from '../../domain/resource-requirement';
import { Service, ServiceBookingModel } from '../../domain/service.aggregate';
import { ServiceLegReconstituteProps } from '../../domain/service-leg';
import { ServiceBookingPolicyProps } from '../../domain/service.types';

// Shared by CreateServiceUseCase and UpdateServiceUseCase — both return the same fully-resolved
// Service shape (docs/CODE_STANDARDS.md's "extract once a second real caller exists").
export interface ServiceUseCaseResult {
  id: string;
  name: string;
  description: string | null;
  price: { amount: number; currency: string; formatted: string };
  durationMinutes: number;
  loyaltyPointsValue: number;
  requiresPickupAddress: boolean;
  isActive: boolean;
  createdAt: string;
  bookingModel: ServiceBookingModel;
  resourceRequirements: ResourceRequirementProps[];
  bufferAfterMinutes: number | null;
  legs: ServiceLegReconstituteProps[] | null;
  classResourceSlots: ReturnType<ClassResourceSlot['toJSON']>[] | null;
  bookingPolicy: ServiceBookingPolicyProps;
}

// M22-S02: a null bookingPolicy.defaultApprovalMode means "inherit the tenant default" — resolved
// here, on every read, from settings.booking.autoApproveEnabled (never persisted onto the service
// row, so a later tenant-settings change is reflected immediately). autoApproveEnabled is the
// caller's already-fetched IBookingPlatformPort.getAutoApproveEnabled() result, not refetched here.
export function resolveApprovalMode(
  policy: ServiceBookingPolicyProps,
  autoApproveEnabled: boolean,
): ServiceBookingPolicyProps {
  if (policy.defaultApprovalMode !== null) return policy;
  return {
    ...policy,
    defaultApprovalMode: autoApproveEnabled ? 'AUTO_CONFIRM' : 'MANUAL_APPROVAL',
  };
}

export function toServiceResult(
  service: Service,
  locale: string,
  autoApproveEnabled: boolean,
): ServiceUseCaseResult {
  return {
    id: service.id,
    name: service.name,
    description: service.description,
    price: {
      amount: service.price.amount.toNumber(),
      currency: service.price.currency,
      formatted: service.price.format(locale),
    },
    durationMinutes: service.durationMinutes,
    loyaltyPointsValue: service.loyaltyPointsValue,
    requiresPickupAddress: service.requiresPickupAddress,
    isActive: service.isActive,
    createdAt: service.createdAt.toISOString(),
    bookingModel: service.bookingModel,
    resourceRequirements: service.resourceRequirements.map((r) => r.toJSON()),
    bufferAfterMinutes: service.bufferAfterMinutes,
    legs: service.legs ? service.legs.map((l) => l.toJSON()) : null,
    classResourceSlots: service.classResourceSlots
      ? service.classResourceSlots.map((s) => s.toJSON())
      : null,
    bookingPolicy: resolveApprovalMode(service.bookingPolicy, autoApproveEnabled),
  };
}
