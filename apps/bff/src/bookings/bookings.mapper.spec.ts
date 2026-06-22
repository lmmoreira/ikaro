import { BookingDetailResponse, BookingListItem } from './bookings.types';
import {
  toCustomerBookingListItem,
  toStaffBookingCard,
  toStaffBookingDetail,
} from './bookings.mapper';

const BOOKING_ID = '40000000-0000-4000-8000-000000000001';
const SERVICE_ID = '30000000-0000-4000-8000-000000000001';
const LINE_ID = '50000000-0000-4000-8000-000000000001';

describe('toStaffBookingCard()', () => {
  const backendItem: BookingListItem = {
    id: BOOKING_ID,
    status: 'PENDING',
    type: 'CUSTOMER',
    customerId: '20000000-0000-4000-8000-000000000001',
    contactName: 'João',
    contactEmail: 'joao@example.com',
    scheduledAt: '2026-06-15T10:00:00.000Z',
    totalDurationMins: 30,
    totalPrice: { amount: 100, currency: 'BRL', formatted: 'R$ 100,00' },
    lineSummary: [
      {
        lineId: LINE_ID,
        serviceId: SERVICE_ID,
        serviceNameAtBooking: 'Lavagem Simples',
        durationMinsAtBooking: 30,
        priceAtBooking: { amount: 100, currency: 'BRL', formatted: 'R$ 100,00' },
      },
    ],
    createdAt: '2026-01-01T00:00:00.000Z',
  };

  it('maps backend booking-list item fields to StaffBookingCardResponse', () => {
    const result = toStaffBookingCard(backendItem);

    expect(result).toEqual({
      bookingId: BOOKING_ID,
      status: 'PENDING',
      scheduledAt: '2026-06-15T10:00:00.000Z',
      contactName: 'João',
      serviceNames: ['Lavagem Simples'],
      totalPrice: { amount: 100, currency: 'BRL' },
      totalDurationMins: 30,
      isCustomer: true,
    });
  });

  it('sets isCustomer false for guest bookings (customerId null)', () => {
    const result = toStaffBookingCard({ ...backendItem, customerId: null });
    expect(result.isCustomer).toBe(false);
  });

  it('maps multiple line summaries to serviceNames in order', () => {
    const result = toStaffBookingCard({
      ...backendItem,
      lineSummary: [
        ...backendItem.lineSummary,
        {
          lineId: 'line-2',
          serviceId: 'service-2',
          serviceNameAtBooking: 'Cera',
          durationMinsAtBooking: 15,
          priceAtBooking: { amount: 50, currency: 'BRL', formatted: 'R$ 50,00' },
        },
      ],
    });
    expect(result.serviceNames).toEqual(['Lavagem Simples', 'Cera']);
  });
});

describe('toCustomerBookingListItem()', () => {
  const backendItem: BookingListItem = {
    id: BOOKING_ID,
    status: 'PENDING',
    type: 'CUSTOMER',
    customerId: '20000000-0000-4000-8000-000000000001',
    contactName: 'João',
    contactEmail: 'joao@example.com',
    scheduledAt: '2026-06-15T10:00:00.000Z',
    totalDurationMins: 30,
    totalPrice: { amount: 100, currency: 'BRL', formatted: 'R$ 100,00' },
    lineSummary: [
      {
        lineId: LINE_ID,
        serviceId: SERVICE_ID,
        serviceNameAtBooking: 'Lavagem Simples',
        durationMinsAtBooking: 30,
        priceAtBooking: { amount: 100, currency: 'BRL', formatted: 'R$ 100,00' },
      },
    ],
    createdAt: '2026-01-01T00:00:00.000Z',
  };

  it('maps backend booking-list item fields to CustomerBookingListItem, dropping contact info and formatted price', () => {
    const result = toCustomerBookingListItem(backendItem);

    expect(result).toEqual({
      bookingId: BOOKING_ID,
      status: 'PENDING',
      scheduledAt: '2026-06-15T10:00:00.000Z',
      lines: [
        {
          lineId: LINE_ID,
          serviceName: 'Lavagem Simples',
          durationMinsAtBooking: 30,
          priceAtBooking: { amount: 100, currency: 'BRL' },
        },
      ],
      totalPrice: { amount: 100, currency: 'BRL' },
    });
  });

  it('maps multiple lines in order', () => {
    const result = toCustomerBookingListItem({
      ...backendItem,
      lineSummary: [
        ...backendItem.lineSummary,
        {
          lineId: 'line-2',
          serviceId: 'service-2',
          serviceNameAtBooking: 'Cera',
          durationMinsAtBooking: 15,
          priceAtBooking: { amount: 50, currency: 'BRL', formatted: 'R$ 50,00' },
        },
      ],
    });
    expect(result.lines.map((l) => l.serviceName)).toEqual(['Lavagem Simples', 'Cera']);
  });
});

describe('toStaffBookingDetail()', () => {
  const backendDetail: BookingDetailResponse = {
    id: BOOKING_ID,
    status: 'PENDING',
    type: 'CUSTOMER',
    customerId: null,
    contactName: 'João',
    contactEmail: 'joao@example.com',
    contactPhone: '+5531999999999',
    contactAddress: null,
    scheduledAt: '2026-06-15T10:00:00.000Z',
    totalDurationMins: 30,
    totalPrice: { amount: 100, currency: 'BRL', formatted: 'R$ 100,00' },
    totalActualPrice: null,
    pickupAddress: null,
    lines: [],
    beforeServicePhotoUrls: [],
    afterServicePhotoUrls: [],
    adminNotes: null,
    infoRequestMessage: null,
    infoResponseMessage: null,
    approvedAt: null,
    approvedBy: null,
    rejectionReason: null,
    createdAt: '2026-01-01T00:00:00.000Z',
  };

  it('maps backend booking detail fields and the given loyaltyBalance to StaffBookingDetailResponse', () => {
    const result = toStaffBookingDetail(backendDetail, null);

    expect(result).toEqual({
      bookingId: BOOKING_ID,
      status: 'PENDING',
      scheduledAt: '2026-06-15T10:00:00.000Z',
      type: 'CUSTOMER',
      contactName: 'João',
      contactEmail: 'joao@example.com',
      contactPhone: '+5531999999999',
      contactAddress: null,
      pickupAddress: null,
      customerId: null,
      loyaltyBalance: null,
      lines: [],
      totalPrice: { amount: 100, currency: 'BRL' },
      totalDurationMins: 30,
      beforeServicePhotoUrls: [],
      afterServicePhotoUrls: [],
      infoRequestMessage: null,
      infoResponseMessage: null,
      approvedAt: null,
      approvedBy: null,
      rejectionReason: null,
    });
  });

  it('passes through the given loyaltyBalance value', () => {
    const result = toStaffBookingDetail(backendDetail, 150);
    expect(result.loyaltyBalance).toBe(150);
  });

  it('maps contactAddress, approvedAt/approvedBy and rejectionReason audit fields', () => {
    const detail: BookingDetailResponse = {
      ...backendDetail,
      contactAddress: {
        street: 'Rua A',
        number: '10',
        complement: null,
        neighborhood: 'Centro',
        city: 'Belo Horizonte',
        state: 'MG',
        zipCode: '30100-000',
      },
      approvedAt: '2026-05-01T10:00:00.000Z',
      approvedBy: '20000000-0000-4000-8000-000000000099',
      rejectionReason: 'Cliente não confirmou disponibilidade',
    };

    const result = toStaffBookingDetail(detail, null);

    expect(result.contactAddress).toEqual({
      street: 'Rua A',
      number: '10',
      complement: null,
      neighborhood: 'Centro',
      city: 'Belo Horizonte',
      state: 'MG',
      zipCode: '30100-000',
    });
    expect(result.approvedAt).toBe('2026-05-01T10:00:00.000Z');
    expect(result.approvedBy).toBe('20000000-0000-4000-8000-000000000099');
    expect(result.rejectionReason).toBe('Cliente não confirmou disponibilidade');
  });

  it('maps before/after-service photo URLs through unchanged', () => {
    const detail: BookingDetailResponse = {
      ...backendDetail,
      beforeServicePhotoUrls: ['https://example.com/before.jpg'],
      afterServicePhotoUrls: ['https://example.com/after.jpg'],
    };

    const result = toStaffBookingDetail(detail, null);

    expect(result.beforeServicePhotoUrls).toEqual(['https://example.com/before.jpg']);
    expect(result.afterServicePhotoUrls).toEqual(['https://example.com/after.jpg']);
  });

  it('maps lines to StaffBookingLineResponse, dropping serviceId/actualPriceCharged', () => {
    const detail: BookingDetailResponse = {
      ...backendDetail,
      lines: [
        {
          lineId: 'line-1',
          serviceId: 'service-1',
          serviceNameAtBooking: 'Lavagem Completa',
          priceAtBooking: { amount: 100, currency: 'BRL', formatted: 'R$ 100,00' },
          durationMinsAtBooking: 30,
          pointsValueAtBooking: 10,
          requiresPickupAddressAtBooking: false,
          actualPriceCharged: null,
        },
      ],
    };

    const result = toStaffBookingDetail(detail, null);

    expect(result.lines).toEqual([
      {
        lineId: 'line-1',
        serviceName: 'Lavagem Completa',
        priceAtBooking: { amount: 100, currency: 'BRL' },
        durationMinsAtBooking: 30,
        pointsValueAtBooking: 10,
        requiresPickupAddressAtBooking: false,
      },
    ]);
  });
});
