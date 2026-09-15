import type { ResourceType } from './enums';
import type { Money, MoneyAmount } from './money';

export type ServiceBookingModel = 'APPOINTMENT' | 'SESSION';
export type ResourceRequirementSelectionMode =
  'NONE' | 'CUSTOMER_CHOICE' | 'AUTO_ANY' | 'AUTO_FUNGIBLE_POOL';

export interface ResourceRequirementItem {
  type: ResourceType;
  selectionMode: ResourceRequirementSelectionMode;
  resourcePoolIds: string[] | null;
  requiredQuantity: number;
}

export interface ServiceLegItem {
  legIndex: number;
  name: string;
  durationMinutes: number;
  resourceRequirements: ResourceRequirementItem[];
  transitionGapAfterMinutes: number;
}

export interface ClassResourceSlotItem {
  type: ResourceType;
  eligibleResourceIds: string[];
}

export type ServiceApprovalMode = 'AUTO_CONFIRM' | 'MANUAL_APPROVAL';
export type ServiceDurationPolicy = 'FIXED' | 'CUSTOMER_SELECTED';
export type ServicePricingPolicy = 'FIXED' | 'PER_TIME_INCREMENT';

export interface ServiceBookingPolicyItem {
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

export interface CreateServiceRequest {
  name: string;
  description?: string;
  priceAmount: number;
  durationMinutes: number;
  loyaltyPointsValue: number;
  requiresPickupAddress?: boolean;
  isActive?: boolean;
  bookingModel?: ServiceBookingModel;
  classResourceSlots?: ClassResourceSlotItem[];
}

export interface UpdateServiceRequest {
  name?: string;
  description?: string | null;
  priceAmount?: number;
  durationMinutes?: number;
  loyaltyPointsValue?: number;
  requiresPickupAddress?: boolean;
  bufferAfterMinutes?: number;
  bookingModel?: ServiceBookingModel;
  // Only meaningful (and required) when this same request converts bookingModel to SESSION —
  // mirrors CreateServiceRequest's identical field.
  classResourceSlots?: ClassResourceSlotItem[];
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
  bookingModel: ServiceBookingModel;
  resourceRequirements: ResourceRequirementItem[];
  bufferAfterMinutes: number | null;
  legs: ServiceLegItem[] | null;
  classResourceSlots: ClassResourceSlotItem[] | null;
  bookingPolicy: ServiceBookingPolicyItem;
}

export interface StaffServiceListResponse {
  items: StaffServiceResponse[];
  total: number;
}
