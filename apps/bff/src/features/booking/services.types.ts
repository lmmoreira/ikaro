export type ServiceBookingModel = 'APPOINTMENT' | 'SESSION';
export type ResourceRequirementSelectionMode =
  'NONE' | 'CUSTOMER_CHOICE' | 'AUTO_ANY' | 'AUTO_FUNGIBLE_POOL';

export interface ResourceRequirementDetail {
  type: string;
  selectionMode: ResourceRequirementSelectionMode;
  resourcePoolIds: string[] | null;
  requiredQuantity: number;
}

export interface ServiceLegDetail {
  legIndex: number;
  name: string;
  durationMinutes: number;
  resourceRequirements: ResourceRequirementDetail[];
  transitionGapAfterMinutes: number;
}

export interface ClassResourceSlotDetail {
  type: string;
  eligibleResourceIds: string[];
}

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
  bookingModel: ServiceBookingModel;
  resourceRequirements: ResourceRequirementDetail[];
  bufferAfterMinutes: number | null;
  legs: ServiceLegDetail[] | null;
  classResourceSlots: ClassResourceSlotDetail[] | null;
}

export interface ServiceListResponse {
  items: ServiceDetail[];
}

export interface UpdateServiceResourceRequirementsResult {
  id: string;
  resourceRequirements: ResourceRequirementDetail[];
}

export interface UpdateServiceLegsResult {
  id: string;
  legs: ServiceLegDetail[];
  totalSpanMinutes: number;
}
