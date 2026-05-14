import type { Money } from './money';

export interface CreateServiceRequest {
  name: string;
  description?: string;
  price: number;
  durationMinutes: number;
  loyaltyPoints: number;
  requiresPickupAddress: boolean;
}

export interface UpdateServiceRequest {
  name?: string;
  description?: string;
  price?: number;
  durationMinutes?: number;
  loyaltyPoints?: number;
  requiresPickupAddress?: boolean;
  isActive?: boolean;
}

export interface ServiceResponse {
  id: string;
  tenantId: string;
  name: string;
  description?: string;
  price: Money;
  durationMinutes: number;
  loyaltyPoints: number;
  requiresPickupAddress: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}
