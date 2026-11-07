import type { StaffServiceResponse } from '@ikaro/types';

// An active, fixed-duration, flat service with no legs and no resource requirements.
const STAFF_SERVICE_DEFAULTS: StaffServiceResponse = {
  serviceId: 'svc-1',
  name: 'Lavagem Completa',
  description: 'Serviço completo',
  price: { amount: 180, currency: 'BRL' },
  durationMinutes: 60,
  loyaltyPointsValue: 20,
  requiresPickupAddress: true,
  isActive: true,
  createdAt: '2026-06-01T00:00:00.000Z',
  bookingModel: 'APPOINTMENT',
  resourceRequirements: [],
  bufferAfterMinutes: null,
  tenantDefaultBufferMinutes: 60,
  legs: null,
  classResourceSlots: null,
  publicPagePublished: false,
  publicSlug: null,
  publicProfile: null,
  bookingPolicy: {
    defaultApprovalMode: null,
    manualHoldMinutes: null,
    cancellationWindowHoursOverride: null,
    rescheduleWindowHoursOverride: null,
    minBookingAdvanceHoursOverride: null,
    maxBookingAdvanceDaysOverride: null,
    effectiveMinBookingAdvanceHours: 0,
    effectiveMaxBookingAdvanceDays: 90,
    recurrenceEligible: false,
    recurringHorizonDays: null,
    availabilityAlertEligible: false,
    durationPolicy: 'FIXED',
    durationMinMinutes: null,
    durationMaxMinutes: null,
    durationIncrementMinutes: null,
    pricingPolicy: 'FIXED',
    pricingIncrementMinutes: null,
    pricePerIncrementAmount: null,
    minimumChargeAmount: null,
  },
};

// A complete StaffServiceResponse for the dashboard's service screens; `overrides` replace whole
// fields.
export function makeStaffService(
  overrides: Partial<StaffServiceResponse> = {},
): StaffServiceResponse {
  return { ...STAFF_SERVICE_DEFAULTS, ...overrides };
}
