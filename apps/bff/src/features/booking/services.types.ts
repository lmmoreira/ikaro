export interface ServiceDetail {
  id: string;
  name: string;
  description: string | null;
  price: { amount: number; currency: string };
  durationMinutes: number;
  loyaltyPointsValue: number;
  requiresPickupAddress: boolean;
  isActive: boolean;
  createdAt: string;
}

export interface ServiceListResponse {
  items: ServiceDetail[];
}
