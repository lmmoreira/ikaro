import {
  GetPublicServiceIntakeSchemaResult,
  GetServiceIntakeSchemaResult,
  ServiceDetail,
} from './services.types';
import {
  toPublicServiceIntakeSchemaResponse,
  toServiceIntakeSchemaResponse,
  toStaffServiceEditViewResponse,
  toStaffServiceListResponse,
  toStaffServiceResponse,
} from './services.mapper';

const bookingPolicy = {
  defaultApprovalMode: null,
  manualHoldMinutes: null,
  cancellationWindowHoursOverride: null,
  rescheduleWindowHoursOverride: null,
  minBookingAdvanceHoursOverride: null,
  maxBookingAdvanceDaysOverride: null,
  recurrenceEligible: false,
  availabilityAlertEligible: false,
  durationPolicy: 'FIXED' as const,
  durationMinMinutes: null,
  durationMaxMinutes: null,
  durationIncrementMinutes: null,
  pricingPolicy: 'FIXED' as const,
  pricingIncrementMinutes: null,
  pricePerIncrementAmount: null,
  minimumChargeAmount: null,
};

const serviceDetail: ServiceDetail = {
  id: '10000000-0000-4000-8000-000000000001',
  name: 'Lavagem Completa',
  description: 'Lavagem exterior e interior',
  price: { amount: 150, currency: 'BRL' },
  durationMinutes: 60,
  loyaltyPointsValue: 10,
  requiresPickupAddress: false,
  isActive: true,
  createdAt: '2026-01-01T00:00:00.000Z',
  bookingModel: 'APPOINTMENT',
  resourceRequirements: [],
  bufferAfterMinutes: 60,
  legs: null,
  classResourceSlots: null,
  bookingPolicy,
};

describe('toStaffServiceResponse()', () => {
  it('maps backend service detail fields to StaffServiceResponse', () => {
    const result = toStaffServiceResponse(serviceDetail);

    expect(result).toEqual({
      serviceId: '10000000-0000-4000-8000-000000000001',
      name: 'Lavagem Completa',
      description: 'Lavagem exterior e interior',
      price: { amount: 150, currency: 'BRL' },
      durationMinutes: 60,
      loyaltyPointsValue: 10,
      requiresPickupAddress: false,
      isActive: true,
      createdAt: '2026-01-01T00:00:00.000Z',
      bookingModel: 'APPOINTMENT',
      resourceRequirements: [],
      bufferAfterMinutes: 60,
      legs: null,
      classResourceSlots: null,
      bookingPolicy,
    });
  });

  it('preserves a null description', () => {
    const result = toStaffServiceResponse({ ...serviceDetail, description: null });
    expect(result.description).toBeNull();
  });

  it('preserves isActive: false for deactivated services', () => {
    const result = toStaffServiceResponse({ ...serviceDetail, isActive: false });
    expect(result.isActive).toBe(false);
  });

  it('maps flat resourceRequirements', () => {
    const result = toStaffServiceResponse({
      ...serviceDetail,
      resourceRequirements: [
        {
          type: 'STAFF',
          selectionMode: 'CUSTOMER_CHOICE',
          resourcePoolIds: null,
          requiredQuantity: 1,
        },
      ],
    });
    expect(result.resourceRequirements).toEqual([
      {
        type: 'STAFF',
        selectionMode: 'CUSTOMER_CHOICE',
        resourcePoolIds: null,
        requiredQuantity: 1,
      },
    ]);
  });

  it('maps legs with their nested resourceRequirements', () => {
    const result = toStaffServiceResponse({
      ...serviceDetail,
      resourceRequirements: [],
      bufferAfterMinutes: null,
      legs: [
        {
          legIndex: 0,
          name: 'Etapa 1',
          durationMinutes: 20,
          resourceRequirements: [
            { type: 'ROOM', selectionMode: 'AUTO_ANY', resourcePoolIds: null, requiredQuantity: 1 },
          ],
          transitionGapAfterMinutes: 5,
        },
      ],
    });
    expect(result.legs).toEqual([
      {
        legIndex: 0,
        name: 'Etapa 1',
        durationMinutes: 20,
        resourceRequirements: [
          { type: 'ROOM', selectionMode: 'AUTO_ANY', resourcePoolIds: null, requiredQuantity: 1 },
        ],
        transitionGapAfterMinutes: 5,
      },
    ]);
  });

  it('maps classResourceSlots for a SESSION service', () => {
    const result = toStaffServiceResponse({
      ...serviceDetail,
      bookingModel: 'SESSION',
      resourceRequirements: [],
      bufferAfterMinutes: null,
      classResourceSlots: [{ type: 'ROOM', eligibleResourceIds: ['r-1', 'r-2'] }],
    });
    expect(result.classResourceSlots).toEqual([
      { type: 'ROOM', eligibleResourceIds: ['r-1', 'r-2'] },
    ]);
  });
});

describe('toStaffServiceListResponse()', () => {
  it('maps each item and sets total to the item count', () => {
    const result = toStaffServiceListResponse({
      items: [serviceDetail, { ...serviceDetail, id: 'service-2', name: 'Cera' }],
    });

    expect(result.total).toBe(2);
    expect(result.items.map((i) => i.name)).toEqual(['Lavagem Completa', 'Cera']);
  });

  it('returns an empty list with total 0', () => {
    const result = toStaffServiceListResponse({ items: [] });
    expect(result).toEqual({ items: [], total: 0 });
  });
});

describe('toServiceIntakeSchemaResponse()', () => {
  const version = (n: number) => ({
    id: `schema-${n}`,
    version: n,
    questions: [
      { fieldKey: 'allergy', label: 'Alergia?', type: 'BOOLEAN' as const, required: true },
    ],
    consentText: `v${n}`,
    consentVersion: n,
    requiresNamedAttendees: n === 2,
    participantCountRequired: false,
    createdAt: '2026-01-01T00:00:00.000Z',
  });

  it('maps the active version and history field by field', () => {
    const result: GetServiceIntakeSchemaResult = { active: version(2), history: [version(1)] };

    expect(toServiceIntakeSchemaResponse(result)).toEqual({
      active: version(2),
      history: [version(1)],
    });
  });

  it('keeps active null and history empty for a service that never published', () => {
    expect(toServiceIntakeSchemaResponse({ active: null, history: [] })).toEqual({
      active: null,
      history: [],
    });
  });

  it('drops any extra field the backend adds, so the BFF contract cannot drift silently', () => {
    const withExtra = {
      active: { ...version(1), internalOnly: 'x' },
      history: [],
    } as unknown as GetServiceIntakeSchemaResult;

    expect(toServiceIntakeSchemaResponse(withExtra).active).not.toHaveProperty('internalOnly');
  });
});

describe('toPublicServiceIntakeSchemaResponse() (M23-S02, UC-068)', () => {
  const version = (n: number) => ({
    id: `schema-${n}`,
    version: n,
    questions: [
      { fieldKey: 'allergy', label: 'Alergia?', type: 'BOOLEAN' as const, required: true },
    ],
    consentText: `v${n}`,
    consentVersion: n,
    requiresNamedAttendees: false,
    participantCountRequired: false,
    createdAt: '2026-01-01T00:00:00.000Z',
  });

  it('maps the active version only, with no history key at all', () => {
    const result: GetPublicServiceIntakeSchemaResult = { active: version(1) };

    expect(toPublicServiceIntakeSchemaResponse(result)).toEqual({ active: version(1) });
    expect(toPublicServiceIntakeSchemaResponse(result)).not.toHaveProperty('history');
  });

  it('keeps active null for a service that never published', () => {
    expect(toPublicServiceIntakeSchemaResponse({ active: null })).toEqual({ active: null });
  });
});

describe('toStaffServiceEditViewResponse()', () => {
  it('composes the mapped service and the mapped intake schema into one response', () => {
    const result = toStaffServiceEditViewResponse(serviceDetail, { active: null, history: [] });

    expect(result.service.serviceId).toBe(serviceDetail.id);
    expect(result.intakeSchema).toEqual({ active: null, history: [] });
  });
});
