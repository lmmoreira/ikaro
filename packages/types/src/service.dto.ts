import type { Money, MoneyAmount } from './money';

export interface CreateServiceRequest {
  name: string;
  description?: string;
  priceAmount: number;
  durationMinutes: number;
  loyaltyPointsValue: number;
  requiresPickupAddress?: boolean;
}

export interface UpdateServiceRequest {
  name?: string;
  description?: string | null;
  priceAmount?: number;
  durationMinutes?: number;
  loyaltyPointsValue?: number;
  requiresPickupAddress?: boolean;
}

export interface ServiceResponse {
  id: string;
  tenantId: string;
  name: string;
  description?: string;
  price: Money;
  durationMinutes: number;
  loyaltyPointsValue: number;
  requiresPickupAddress: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface StaffServiceResponse {
  serviceId: string;
  name: string;
  description: string | null;
  price: MoneyAmount;
  durationMinutes: number;
  loyaltyPointsValue: number;
  requiresPickupAddress: boolean;
  isActive: boolean;
  createdAt: string;
}

export interface StaffServiceListResponse {
  items: StaffServiceResponse[];
  total: number;
}
