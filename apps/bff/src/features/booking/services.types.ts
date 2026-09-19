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

export type ServiceApprovalMode = 'AUTO_CONFIRM' | 'MANUAL_APPROVAL';
export type ServiceDurationPolicy = 'FIXED' | 'CUSTOMER_SELECTED';
export type ServicePricingPolicy = 'FIXED' | 'PER_TIME_INCREMENT';

export interface ServiceBookingPolicyDetail {
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
  bookingPolicy: ServiceBookingPolicyDetail;
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

export interface UpdateServiceBookingPolicyResult {
  id: string;
  bookingPolicy: ServiceBookingPolicyDetail;
}

export type ServiceIntakeQuestionType = 'FREE_TEXT' | 'BOOLEAN';

export interface ServiceIntakeQuestionDetail {
  fieldKey: string;
  label: string;
  type: ServiceIntakeQuestionType;
  required: boolean;
}

export interface PublishServiceIntakeSchemaResult {
  id: string;
  version: number;
  questions: ServiceIntakeQuestionDetail[];
  consentText: string;
  consentVersion: number;
  requiresNamedAttendees: boolean;
  participantCountRequired: boolean;
  createdAt: string;
}

export type ServiceIntakeSchemaVersionDetail = PublishServiceIntakeSchemaResult;

// UC-054 read path — added M22-S04. `active` is null until the service's first publish.
export interface GetServiceIntakeSchemaResult {
  active: ServiceIntakeSchemaVersionDetail | null;
  history: ServiceIntakeSchemaVersionDetail[];
}
