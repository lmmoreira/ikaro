import { ServiceDetail } from './services.types';
import { toStaffServiceListResponse, toStaffServiceResponse } from './services.mapper';

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
