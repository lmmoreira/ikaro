import { ServiceDetail } from './services.types';
import { toStaffServiceListResponse, toStaffServiceResponse } from './services.mapper';

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
};

describe('toStaffServiceResponse()', () => {
  it('maps backend service detail fields to StaffServiceResponse, dropping formatted price', () => {
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
