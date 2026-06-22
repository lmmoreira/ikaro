import { StaffServiceListResponse, StaffServiceResponse } from '@ikaro/types';
import { ServiceDetail, ServiceListResponse } from './services.types';

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
  };
}

export function toStaffServiceListResponse(list: ServiceListResponse): StaffServiceListResponse {
  const items = list.items.map(toStaffServiceResponse);
  return { items, total: items.length };
}
