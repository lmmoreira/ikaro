import {
  GetPublicServiceIntakeSchemaResult,
  GetServiceIntakeSchemaResult,
  ServiceDetail,
} from './services.types';
import {
  toPublicServiceListResponse,
  toPublicServiceQuoteResponse,
  toPublicServiceResourceOptionsResponse,
  toPublicServiceResponse,
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
  effectiveMinBookingAdvanceHours: 0,
  effectiveMaxBookingAdvanceDays: 90,
  recurrenceEligible: false,
  recurringHorizonDays: null,
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
  price: { amount: 150, currency: 'BRL', formatted: 'R$ 150,00' },
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

describe('toPublicServiceResponse() (M23-S29)', () => {
  const sensitivePolicy = {
    ...bookingPolicy,
    defaultApprovalMode: 'MANUAL_APPROVAL' as const,
    manualHoldMinutes: 30,
    cancellationWindowHoursOverride: 24,
    rescheduleWindowHoursOverride: 24,
    minBookingAdvanceHoursOverride: 2,
    maxBookingAdvanceDaysOverride: 30,
    effectiveMinBookingAdvanceHours: 2,
    effectiveMaxBookingAdvanceDays: 30,
    availabilityAlertEligible: true,
    recurrenceEligible: true,
    recurringHorizonDays: 90,
    durationPolicy: 'CUSTOMER_SELECTED' as const,
    durationMinMinutes: 60,
    durationMaxMinutes: 240,
    durationIncrementMinutes: 30,
    pricingPolicy: 'PER_TIME_INCREMENT' as const,
    pricingIncrementMinutes: 60,
    pricePerIncrementAmount: 50,
    minimumChargeAmount: 80,
  };
  const privateService: ServiceDetail = {
    ...serviceDetail,
    resourceRequirements: [
      {
        type: 'STAFF',
        selectionMode: 'CUSTOMER_CHOICE',
        resourcePoolIds: ['pool-1', 'pool-2'],
        requiredQuantity: 1,
      },
    ],
    legs: [
      {
        legIndex: 0,
        name: 'Etapa',
        durationMinutes: 30,
        resourceRequirements: [
          {
            type: 'ROOM',
            selectionMode: 'AUTO_ANY',
            resourcePoolIds: ['room-1'],
            requiredQuantity: 2,
          },
        ],
        transitionGapAfterMinutes: 5,
      },
    ],
    classResourceSlots: [{ type: 'ROOM', eligibleResourceIds: ['room-1'] }],
    bookingPolicy: sensitivePolicy,
  };

  it('maps every retained and added field', () => {
    const result = toPublicServiceResponse(privateService);

    expect(result).toEqual({
      id: privateService.id,
      name: 'Lavagem Completa',
      description: 'Lavagem exterior e interior',
      price: { amount: 150, currency: 'BRL', formatted: 'R$ 150,00' },
      durationMinutes: 60,
      loyaltyPointsValue: 10,
      requiresPickupAddress: false,
      isActive: true,
      createdAt: '2026-01-01T00:00:00.000Z',
      bookingModel: 'APPOINTMENT',
      resourceRequirements: [
        { type: 'STAFF', selectionMode: 'CUSTOMER_CHOICE', requiredQuantity: 1 },
      ],
      legs: [
        {
          legIndex: 0,
          name: 'Etapa',
          durationMinutes: 30,
          resourceRequirements: [{ type: 'ROOM', selectionMode: 'AUTO_ANY', requiredQuantity: 2 }],
          transitionGapAfterMinutes: 5,
        },
      ],
      bookingPolicy: {
        effectiveMinBookingAdvanceHours: 2,
        effectiveMaxBookingAdvanceDays: 30,
        durationPolicy: 'CUSTOMER_SELECTED',
        durationMinMinutes: 60,
        durationMaxMinutes: 240,
        durationIncrementMinutes: 30,
        pricingPolicy: 'PER_TIME_INCREMENT',
        pricingIncrementMinutes: 60,
        pricePerIncrementAmount: 50,
        minimumChargeAmount: 80,
        recurrenceEligible: true,
        recurringHorizonDays: 90,
      },
    });
  });

  it('never exposes pool ids, overrides, alert/approval policy, hold, class slots or buffer', () => {
    const serialized = JSON.stringify(toPublicServiceResponse(privateService));

    for (const leaked of [
      'resourcePoolIds',
      'pool-1',
      'room-1',
      'Override',
      'availabilityAlertEligible',
      'defaultApprovalMode',
      'manualHoldMinutes',
      'classResourceSlots',
      'bufferAfterMinutes',
    ]) {
      expect(serialized).not.toContain(leaked);
    }
  });

  it('keeps legs null for a flat service', () => {
    expect(toPublicServiceResponse(serviceDetail).legs).toBeNull();
  });
});

describe('toPublicServiceListResponse() (M23-S29)', () => {
  it('maps each item and keeps the { items } list shape', () => {
    const result = toPublicServiceListResponse({ items: [serviceDetail, serviceDetail] });

    expect(result.items).toHaveLength(2);
    expect(result).not.toHaveProperty('total');
  });
});

describe('toPublicServiceResourceOptionsResponse() / toPublicServiceQuoteResponse() (M23-S29)', () => {
  it('keeps only id and name on each option', () => {
    const result = toPublicServiceResourceOptionsResponse({
      requirements: [
        {
          serviceId: 's-1',
          legIndex: null,
          resourceType: 'STAFF',
          selectionMode: 'CUSTOMER_CHOICE',
          requiredQuantity: 1,
          options: [{ resourceId: 'r-1', name: 'Ana', refId: 'staff-uuid' } as never],
        },
      ],
    });

    expect(result.requirements[0].options).toEqual([{ resourceId: 'r-1', name: 'Ana' }]);
  });

  it('maps the quote to { durationMinutes, price: { amount, currency } }', () => {
    expect(
      toPublicServiceQuoteResponse({
        durationMinutes: 90,
        price: { amount: 100, currency: 'BRL', extra: 1 } as never,
      }),
    ).toEqual({ durationMinutes: 90, price: { amount: 100, currency: 'BRL' } });
  });
});
