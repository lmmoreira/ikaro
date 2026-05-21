export interface PriceResponse {
  amount: number;
  currency: string;
  formatted: string;
}

export interface ServiceResponse {
  id: string;
  name: string;
  description: string | null;
  price: PriceResponse;
  durationMinutes: number;
  loyaltyPointsValue: number;
  requiresPickupAddress: boolean;
  isActive: boolean;
  createdAt: string;
}

export interface ServiceListResponse {
  items: ServiceResponse[];
}
