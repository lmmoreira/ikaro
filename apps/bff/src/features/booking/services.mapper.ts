import {
  ClassResourceSlotItem,
  HotsiteServiceLeg,
  HotsiteServiceQuoteResponse,
  HotsiteServiceResourceOptionsResponse,
  HotsiteServiceResourceRequirement,
  HotsiteServiceResponse,
  PublicServiceIntakeSchemaResponse,
  ResourceRequirementItem,
  ServiceIntakeSchemaResponse,
  ServiceIntakeSchemaVersion,
  ServiceLegItem,
  StaffServiceEditViewResponse,
  StaffServiceListResponse,
  StaffServiceResponse,
} from '@ikaro/types';
import {
  ClassResourceSlotDetail,
  GetPublicServiceIntakeSchemaResult,
  GetServiceIntakeSchemaResult,
  GetServiceQuoteResult,
  GetServiceResourceOptionsResult,
  ResourceRequirementDetail,
  ServiceDetail,
  ServiceIntakeSchemaVersionDetail,
  ServiceLegDetail,
  ServiceListResponse,
} from './services.types';

function toResourceRequirementItem(item: ResourceRequirementDetail): ResourceRequirementItem {
  return {
    type: item.type as ResourceRequirementItem['type'],
    selectionMode: item.selectionMode,
    resourcePoolIds: item.resourcePoolIds,
    requiredQuantity: item.requiredQuantity,
  };
}

function toServiceLegItem(leg: ServiceLegDetail): ServiceLegItem {
  return {
    legIndex: leg.legIndex,
    name: leg.name,
    durationMinutes: leg.durationMinutes,
    resourceRequirements: leg.resourceRequirements.map(toResourceRequirementItem),
    transitionGapAfterMinutes: leg.transitionGapAfterMinutes,
  };
}

function toClassResourceSlotItem(slot: ClassResourceSlotDetail): ClassResourceSlotItem {
  return {
    type: slot.type as ClassResourceSlotItem['type'],
    eligibleResourceIds: slot.eligibleResourceIds,
  };
}

export function toStaffServiceResponse(service: ServiceDetail): StaffServiceResponse {
  return {
    serviceId: service.id,
    name: service.name,
    description: service.description,
    price: { amount: service.price.amount, currency: service.price.currency },
    durationMinutes: service.durationMinutes,
    loyaltyPointsValue: service.loyaltyPointsValue,
    requiresPickupAddress: service.requiresPickupAddress,
    isActive: service.isActive,
    createdAt: service.createdAt,
    bookingModel: service.bookingModel,
    resourceRequirements: service.resourceRequirements.map(toResourceRequirementItem),
    bufferAfterMinutes: service.bufferAfterMinutes,
    legs: service.legs ? service.legs.map(toServiceLegItem) : null,
    classResourceSlots: service.classResourceSlots
      ? service.classResourceSlots.map(toClassResourceSlotItem)
      : null,
    bookingPolicy: service.bookingPolicy,
  };
}

export function toStaffServiceListResponse(list: ServiceListResponse): StaffServiceListResponse {
  const items = list.items.map(toStaffServiceResponse);
  return { items, total: items.length };
}

export function toServiceIntakeSchemaVersion(
  version: ServiceIntakeSchemaVersionDetail,
): ServiceIntakeSchemaVersion {
  return {
    id: version.id,
    version: version.version,
    questions: version.questions.map((question) => ({
      fieldKey: question.fieldKey,
      label: question.label,
      type: question.type,
      required: question.required,
    })),
    consentText: version.consentText,
    consentVersion: version.consentVersion,
    requiresNamedAttendees: version.requiresNamedAttendees,
    participantCountRequired: version.participantCountRequired,
    createdAt: version.createdAt,
  };
}

export function toServiceIntakeSchemaResponse(
  result: GetServiceIntakeSchemaResult,
): ServiceIntakeSchemaResponse {
  return {
    active: result.active ? toServiceIntakeSchemaVersion(result.active) : null,
    history: result.history.map(toServiceIntakeSchemaVersion),
  };
}

// UC-068 (M23-S02) — the public backend endpoint returns `{ active }` only, no `history` key at
// all, so this must not go through toServiceIntakeSchemaResponse above (it unconditionally reads
// `.history`).
export function toPublicServiceIntakeSchemaResponse(
  result: GetPublicServiceIntakeSchemaResult,
): PublicServiceIntakeSchemaResponse {
  return { active: result.active ? toServiceIntakeSchemaVersion(result.active) : null };
}

export function toStaffServiceEditViewResponse(
  service: ServiceDetail,
  intakeSchema: GetServiceIntakeSchemaResult,
): StaffServiceEditViewResponse {
  return {
    service: toStaffServiceResponse(service),
    intakeSchema: toServiceIntakeSchemaResponse(intakeSchema),
  };
}

// The unauthenticated service shape: every field is named explicitly (never an object spread) so a
// field added to the backend's ServiceUseCaseResult can never leak to an anonymous caller.
// toResourceRequirementItem is deliberately NOT reused: it copies resourcePoolIds.
function toHotsiteResourceRequirement(
  item: ResourceRequirementDetail,
): HotsiteServiceResourceRequirement {
  return {
    type: item.type as HotsiteServiceResourceRequirement['type'],
    selectionMode: item.selectionMode,
    requiredQuantity: item.requiredQuantity,
  };
}

function toHotsiteServiceLeg(leg: ServiceLegDetail): HotsiteServiceLeg {
  return {
    legIndex: leg.legIndex,
    name: leg.name,
    durationMinutes: leg.durationMinutes,
    resourceRequirements: leg.resourceRequirements.map(toHotsiteResourceRequirement),
    transitionGapAfterMinutes: leg.transitionGapAfterMinutes,
  };
}

export function toPublicServiceResponse(service: ServiceDetail): HotsiteServiceResponse {
  const policy = service.bookingPolicy;
  return {
    id: service.id,
    name: service.name,
    description: service.description,
    price: {
      amount: service.price.amount,
      currency: service.price.currency,
      formatted: service.price.formatted,
    },
    durationMinutes: service.durationMinutes,
    loyaltyPointsValue: service.loyaltyPointsValue,
    requiresPickupAddress: service.requiresPickupAddress,
    isActive: service.isActive,
    createdAt: service.createdAt,
    bookingModel: service.bookingModel,
    resourceRequirements: service.resourceRequirements.map(toHotsiteResourceRequirement),
    legs: service.legs ? service.legs.map(toHotsiteServiceLeg) : null,
    bookingPolicy: {
      durationPolicy: policy.durationPolicy,
      durationMinMinutes: policy.durationMinMinutes,
      durationMaxMinutes: policy.durationMaxMinutes,
      durationIncrementMinutes: policy.durationIncrementMinutes,
      pricingPolicy: policy.pricingPolicy,
      pricingIncrementMinutes: policy.pricingIncrementMinutes,
      pricePerIncrementAmount: policy.pricePerIncrementAmount,
      minimumChargeAmount: policy.minimumChargeAmount,
      recurrenceEligible: policy.recurrenceEligible,
      recurringHorizonDays: policy.recurringHorizonDays,
      availabilityAlertEligible: policy.availabilityAlertEligible,
    },
  };
}

export function toPublicServiceListResponse(list: ServiceListResponse): {
  items: HotsiteServiceResponse[];
} {
  return { items: list.items.map(toPublicServiceResponse) };
}

export function toPublicServiceResourceOptionsResponse(
  result: GetServiceResourceOptionsResult,
): HotsiteServiceResourceOptionsResponse {
  return {
    requirements: result.requirements.map((requirement) => ({
      serviceId: requirement.serviceId,
      legIndex: requirement.legIndex,
      resourceType: requirement.resourceType as HotsiteServiceResourceRequirement['type'],
      selectionMode: requirement.selectionMode,
      requiredQuantity: requirement.requiredQuantity,
      options: requirement.options.map((option) => ({
        resourceId: option.resourceId,
        name: option.name,
      })),
    })),
  };
}

export function toPublicServiceQuoteResponse(
  result: GetServiceQuoteResult,
): HotsiteServiceQuoteResponse {
  return {
    durationMinutes: result.durationMinutes,
    price: { amount: result.price.amount, currency: result.price.currency },
  };
}
