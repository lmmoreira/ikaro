import {
  ClassResourceSlotItem,
  ResourceRequirementItem,
  ServiceLegItem,
  StaffServiceListResponse,
  StaffServiceResponse,
} from '@ikaro/types';
import {
  ClassResourceSlotDetail,
  ResourceRequirementDetail,
  ServiceDetail,
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
