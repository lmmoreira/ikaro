import { BackendLoyaltyEntryItem, BackendLoyaltyRedemptionItem } from './loyalty.types';
import {
  toCustomerLoyaltyEntry,
  toCustomerLoyaltyRedemption,
  toStaffLoyaltyEntry,
  toStaffLoyaltyRedemption,
} from './loyalty.mapper';

describe('toCustomerLoyaltyEntry()', () => {
  const backendItem: BackendLoyaltyEntryItem = {
    entryId: 'e1111111-0000-4000-8000-000000000001',
    bookingId: 'bbbbbbbb-0000-4000-8000-000000000001',
    serviceId: 'cccccccc-0000-4000-8000-000000000001',
    serviceName: 'Lavagem Completa',
    points: 10,
    earnedAt: '2026-05-28T14:00:00.000Z',
    expiresAt: '2026-11-24T14:00:00.000Z',
    isActive: true,
  };

  it('maps backend entry fields to CustomerLoyaltyEntryResponse, renaming points to pointsEarned', () => {
    const result = toCustomerLoyaltyEntry(backendItem);

    expect(result).toEqual({
      entryId: 'e1111111-0000-4000-8000-000000000001',
      bookingId: 'bbbbbbbb-0000-4000-8000-000000000001',
      serviceName: 'Lavagem Completa',
      pointsEarned: 10,
      earnedAt: '2026-05-28T14:00:00.000Z',
      expiresAt: '2026-11-24T14:00:00.000Z',
      expired: false,
    });
  });

  it('inverts isActive into expired', () => {
    const result = toCustomerLoyaltyEntry({ ...backendItem, isActive: false });
    expect(result.expired).toBe(true);
  });
});

describe('toCustomerLoyaltyRedemption()', () => {
  const backendItem: BackendLoyaltyRedemptionItem = {
    redemptionId: 'r1111111-0000-4000-8000-000000000001',
    pointsRedeemed: 85,
    pointsPerCurrencyUnit: 10,
    redeemedAt: '2026-05-18T10:00:00.000Z',
    notes: null,
    bookingId: 'bbbbbbbb-0000-4000-8000-000000000001',
    bookingServices: [
      { serviceId: 'cccccccc-0000-4000-8000-000000000001', serviceName: 'Lavagem Completa' },
    ],
  };

  it('maps backend redemption fields, renaming pointsRedeemed to pointsUsed', () => {
    const result = toCustomerLoyaltyRedemption(backendItem);

    expect(result).toEqual({
      redemptionId: 'r1111111-0000-4000-8000-000000000001',
      bookingId: 'bbbbbbbb-0000-4000-8000-000000000001',
      pointsUsed: 85,
      amountSaved: 'R$ 8,50',
      redeemedAt: '2026-05-18T10:00:00.000Z',
      bookingReference: 'Lavagem Completa',
    });
  });

  it('returns zero amountSaved when pointsPerCurrencyUnit is 0 (redemption was disabled at that time)', () => {
    const result = toCustomerLoyaltyRedemption({ ...backendItem, pointsPerCurrencyUnit: 0 });
    expect(result.amountSaved).toBe('R$ 0,00');
  });

  it("computes amountSaved from the redemption's own stored rate, not a live/current one", () => {
    const result = toCustomerLoyaltyRedemption({ ...backendItem, pointsPerCurrencyUnit: 5 });
    expect(result.amountSaved).toBe('R$ 17,00');
  });

  it('joins multiple bookingServices into a single comma-separated reference', () => {
    const result = toCustomerLoyaltyRedemption({
      ...backendItem,
      bookingServices: [
        { serviceId: 'cccccccc-0000-4000-8000-000000000001', serviceName: 'Lavagem Completa' },
        { serviceId: 'cccccccc-0000-4000-8000-000000000002', serviceName: 'Busca e Entrega' },
      ],
    });
    expect(result.bookingReference).toBe('Lavagem Completa, Busca e Entrega');
  });

  it('returns null bookingReference when bookingServices is empty', () => {
    const result = toCustomerLoyaltyRedemption({ ...backendItem, bookingServices: [] });
    expect(result.bookingReference).toBeNull();
  });
});

describe('toStaffLoyaltyEntry()', () => {
  it('maps entryId → id and drops serviceId', () => {
    const result = toStaffLoyaltyEntry({
      entryId: 'e1111111-0000-4000-8000-000000000001',
      bookingId: 'bbbbbbbb-0000-4000-8000-000000000001',
      serviceId: 'cccccccc-0000-4000-8000-000000000001',
      serviceName: 'Lavagem Completa',
      points: 10,
      earnedAt: '2026-05-28T14:00:00.000Z',
      expiresAt: '2026-11-24T14:00:00.000Z',
      isActive: true,
    });
    expect(result).toEqual({
      id: 'e1111111-0000-4000-8000-000000000001',
      bookingId: 'bbbbbbbb-0000-4000-8000-000000000001',
      serviceName: 'Lavagem Completa',
      points: 10,
      earnedAt: '2026-05-28T14:00:00.000Z',
      expiresAt: '2026-11-24T14:00:00.000Z',
      isActive: true,
    });
  });
});

describe('toStaffLoyaltyRedemption()', () => {
  it('maps redemptionId → id and computes amountDeducted', () => {
    const result = toStaffLoyaltyRedemption({
      redemptionId: 'r1111111-0000-4000-8000-000000000001',
      pointsRedeemed: 100,
      pointsPerCurrencyUnit: 10,
      redeemedAt: '2026-05-18T10:00:00.000Z',
      notes: null,
      bookingId: 'bbbbbbbb-0000-4000-8000-000000000001',
      bookingServices: [],
    });
    expect(result).toEqual({
      id: 'r1111111-0000-4000-8000-000000000001',
      pointsRedeemed: 100,
      amountDeducted: 10,
      redeemedAt: '2026-05-18T10:00:00.000Z',
      bookingId: 'bbbbbbbb-0000-4000-8000-000000000001',
      notes: null,
    });
  });

  it('returns amountDeducted = 0 when pointsPerCurrencyUnit is 0', () => {
    const result = toStaffLoyaltyRedemption({
      redemptionId: 'r2222222-0000-4000-8000-000000000001',
      pointsRedeemed: 50,
      pointsPerCurrencyUnit: 0,
      redeemedAt: '2026-05-18T10:00:00.000Z',
      notes: null,
      bookingId: null,
      bookingServices: [],
    });
    expect(result.amountDeducted).toBe(0);
  });
});
