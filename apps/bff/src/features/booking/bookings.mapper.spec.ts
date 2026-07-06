import { BookingDetailResponse, BookingListItem } from './bookings.types';
import {
  toCustomerBookingDetail,
  toCustomerBookingListItem,
  toGuestBookingRead,
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
    totalPrice: { amount: 100, currency: 'BRL' },
    lineSummary: [
      {
        lineId: LINE_ID,
        serviceId: SERVICE_ID,
        serviceNameAtBooking: 'Lavagem Simples',
        durationMinsAtBooking: 30,
        priceAtBooking: { amount: 100, currency: 'BRL' },
      },
    ],
    createdAt: '2026-01-01T00:00:00.000Z',
    cancellableUntil: null,
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
          priceAtBooking: { amount: 50, currency: 'BRL' },
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
    totalPrice: { amount: 100, currency: 'BRL' },
    lineSummary: [
      {
        lineId: LINE_ID,
        serviceId: SERVICE_ID,
        serviceNameAtBooking: 'Lavagem Simples',
        durationMinsAtBooking: 30,
        priceAtBooking: { amount: 100, currency: 'BRL' },
      },
    ],
    createdAt: '2026-01-01T00:00:00.000Z',
    cancellableUntil: null,
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
          actualPriceCharged: null,
        },
      ],
      totalPrice: { amount: 100, currency: 'BRL' },
      cancellableUntil: null,
    });
  });

  it('passes through cancellableUntil on APPROVED items', () => {
    const result = toCustomerBookingListItem({
      ...backendItem,
      status: 'APPROVED',
      cancellableUntil: '2026-06-13T10:00:00.000Z',
    });
    expect(result.cancellableUntil).toBe('2026-06-13T10:00:00.000Z');
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
          priceAtBooking: { amount: 50, currency: 'BRL' },
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
    notes: null,
    scheduledAt: '2026-06-15T10:00:00.000Z',
    totalDurationMins: 30,
    totalPrice: { amount: 100, currency: 'BRL' },
    totalActualPrice: null,
    discountPointsUsed: null,
    discountAmount: null,
    pickupAddress: null,
    lines: [],
    beforeServicePhotoUrls: [],
    afterServicePhotoUrls: [],
    adminNotes: null,
    infoRequestMessage: null,
    infoResponseMessage: null,
    approvedAt: null,
    approvedBy: null,
    completedAt: null,
    rejectionReason: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    cancellableUntil: null,
    pointsEarned: null,
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
      totalActualPrice: null,
      discountPointsUsed: null,
      discountAmount: null,
      totalDurationMins: 30,
      beforeServicePhotoUrls: [],
      afterServicePhotoUrls: [],
      infoRequestMessage: null,
      infoResponseMessage: null,
      approvedAt: null,
      approvedBy: null,
      completedAt: null,
      rejectionReason: null,
    });
  });

  it('maps totalActualPrice, discount and completedAt for a completed booking', () => {
    const detail: BookingDetailResponse = {
      ...backendDetail,
      totalActualPrice: { amount: 76, currency: 'BRL' },
      discountPointsUsed: 240,
      discountAmount: { amount: 24, currency: 'BRL' },
      completedAt: '2026-06-01T15:00:00.000Z',
    };

    const result = toStaffBookingDetail(detail, null);

    expect(result.totalActualPrice).toEqual({ amount: 76, currency: 'BRL' });
    expect(result.discountPointsUsed).toBe(240);
    expect(result.discountAmount).toEqual({ amount: 24, currency: 'BRL' });
    expect(result.completedAt).toBe('2026-06-01T15:00:00.000Z');
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

  it('maps lines to StaffBookingLineResponse with a null actualPriceCharged when unset', () => {
    const detail: BookingDetailResponse = {
      ...backendDetail,
      lines: [
        {
          lineId: 'line-1',
          serviceId: 'service-1',
          serviceNameAtBooking: 'Lavagem Completa',
          priceAtBooking: { amount: 100, currency: 'BRL' },
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
        serviceId: 'service-1',
        serviceName: 'Lavagem Completa',
        priceAtBooking: { amount: 100, currency: 'BRL' },
        durationMinsAtBooking: 30,
        pointsValueAtBooking: 10,
        requiresPickupAddressAtBooking: false,
        actualPriceCharged: null,
      },
    ]);
  });

  it('maps lines to StaffBookingLineResponse forwarding actualPriceCharged when set', () => {
    const detail: BookingDetailResponse = {
      ...backendDetail,
      lines: [
        {
          lineId: 'line-1',
          serviceId: 'service-1',
          serviceNameAtBooking: 'Lavagem Completa',
          priceAtBooking: { amount: 100, currency: 'BRL' },
          durationMinsAtBooking: 30,
          pointsValueAtBooking: 10,
          requiresPickupAddressAtBooking: false,
          actualPriceCharged: { amount: 90, currency: 'BRL' },
        },
      ],
    };

    const result = toStaffBookingDetail(detail, null);

    expect(result.lines[0].actualPriceCharged).toEqual({ amount: 90, currency: 'BRL' });
  });
});

describe('toCustomerBookingDetail()', () => {
  const backendDetail: BookingDetailResponse = {
    id: BOOKING_ID,
    status: 'PENDING',
    type: 'CUSTOMER',
    customerId: '20000000-0000-4000-8000-000000000001',
    contactName: 'João',
    contactEmail: 'joao@example.com',
    contactPhone: '+5531999999999',
    contactAddress: null,
    notes: null,
    scheduledAt: '2026-06-15T10:00:00.000Z',
    totalDurationMins: 30,
    totalPrice: { amount: 100, currency: 'BRL' },
    totalActualPrice: null,
    discountPointsUsed: null,
    discountAmount: null,
    pickupAddress: null,
    lines: [],
    beforeServicePhotoUrls: [],
    afterServicePhotoUrls: [],
    adminNotes: 'Staff-only note',
    infoRequestMessage: null,
    infoResponseMessage: null,
    approvedAt: '2026-05-01T10:00:00.000Z',
    approvedBy: '20000000-0000-4000-8000-000000000099',
    completedAt: null,
    rejectionReason: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    cancellableUntil: null,
    pointsEarned: null,
  };

  it('maps backend booking detail fields to CustomerBookingDetailResponse', () => {
    const result = toCustomerBookingDetail(backendDetail);

    expect(result).toEqual({
      bookingId: BOOKING_ID,
      status: 'PENDING',
      scheduledAt: '2026-06-15T10:00:00.000Z',
      lines: [],
      totalPrice: { amount: 100, currency: 'BRL' },
      notes: null,
      cancellableUntil: null,
      infoRequestMessage: null,
      infoResponseMessage: null,
      beforeServicePhotoUrls: [],
      afterServicePhotoUrls: [],
      completedAt: null,
      totalActualPrice: null,
      discountPointsUsed: null,
      discountAmount: null,
      pointsEarned: null,
    });
  });

  it('passes through cancellableUntil for an APPROVED booking', () => {
    const detail: BookingDetailResponse = {
      ...backendDetail,
      status: 'APPROVED',
      cancellableUntil: '2026-06-13T10:00:00.000Z',
    };

    const result = toCustomerBookingDetail(detail);

    expect(result.cancellableUntil).toBe('2026-06-13T10:00:00.000Z');
  });

  it('drops staff-internal fields (adminNotes, approvedBy, rejectionReason, contact info)', () => {
    const result = toCustomerBookingDetail(backendDetail);

    expect(result).not.toHaveProperty('adminNotes');
    expect(result).not.toHaveProperty('approvedBy');
    expect(result).not.toHaveProperty('approvedAt');
    expect(result).not.toHaveProperty('rejectionReason');
    expect(result).not.toHaveProperty('contactName');
    expect(result).not.toHaveProperty('contactEmail');
    expect(result).not.toHaveProperty('contactPhone');
  });

  it('passes through notes, infoRequestMessage and infoResponseMessage', () => {
    const detail: BookingDetailResponse = {
      ...backendDetail,
      notes: 'Carro está sujo de lama',
      infoRequestMessage: 'Pode enviar fotos do veículo?',
      infoResponseMessage: 'Seguem as fotos solicitadas',
    };

    const result = toCustomerBookingDetail(detail);

    expect(result.notes).toBe('Carro está sujo de lama');
    expect(result.infoRequestMessage).toBe('Pode enviar fotos do veículo?');
    expect(result.infoResponseMessage).toBe('Seguem as fotos solicitadas');
  });

  it('maps lines to CustomerBookingLineItem, dropping serviceId/pointsValue/requiresPickupAddress', () => {
    const detail: BookingDetailResponse = {
      ...backendDetail,
      lines: [
        {
          lineId: 'line-1',
          serviceId: 'service-1',
          serviceNameAtBooking: 'Lavagem Completa',
          priceAtBooking: { amount: 100, currency: 'BRL' },
          durationMinsAtBooking: 30,
          pointsValueAtBooking: 10,
          requiresPickupAddressAtBooking: false,
          actualPriceCharged: null,
        },
      ],
    };

    const result = toCustomerBookingDetail(detail);

    expect(result.lines).toEqual([
      {
        lineId: 'line-1',
        serviceName: 'Lavagem Completa',
        durationMinsAtBooking: 30,
        priceAtBooking: { amount: 100, currency: 'BRL' },
        actualPriceCharged: null,
      },
    ]);
  });

  it('maps before/after-service photo URLs through unchanged', () => {
    const detail: BookingDetailResponse = {
      ...backendDetail,
      beforeServicePhotoUrls: ['https://example.com/before.jpg'],
      afterServicePhotoUrls: ['https://example.com/after.jpg'],
    };

    const result = toCustomerBookingDetail(detail);

    expect(result.beforeServicePhotoUrls).toEqual(['https://example.com/before.jpg']);
    expect(result.afterServicePhotoUrls).toEqual(['https://example.com/after.jpg']);
  });

  it('maps completion summary fields for a COMPLETED booking', () => {
    const detail: BookingDetailResponse = {
      ...backendDetail,
      status: 'COMPLETED',
      completedAt: '2026-06-01T15:00:00.000Z',
      totalActualPrice: { amount: 76, currency: 'BRL' },
      discountPointsUsed: 240,
      discountAmount: { amount: 24, currency: 'BRL' },
      // Pre-computed by the backend (sum of lines' pointsValueAtBooking) — the BFF mapper
      // only passes this through, it does not sum the lines itself.
      pointsEarned: 15,
      lines: [
        {
          lineId: 'line-1',
          serviceId: 'service-1',
          serviceNameAtBooking: 'Lavagem Completa',
          priceAtBooking: { amount: 100, currency: 'BRL' },
          durationMinsAtBooking: 30,
          pointsValueAtBooking: 10,
          requiresPickupAddressAtBooking: false,
          actualPriceCharged: { amount: 76, currency: 'BRL' },
        },
        {
          lineId: 'line-2',
          serviceId: 'service-2',
          serviceNameAtBooking: 'Cera',
          priceAtBooking: { amount: 50, currency: 'BRL' },
          durationMinsAtBooking: 15,
          pointsValueAtBooking: 5,
          requiresPickupAddressAtBooking: false,
          actualPriceCharged: null,
        },
      ],
    };

    const result = toCustomerBookingDetail(detail);

    expect(result.completedAt).toBe('2026-06-01T15:00:00.000Z');
    expect(result.totalActualPrice).toEqual({ amount: 76, currency: 'BRL' });
    expect(result.discountPointsUsed).toBe(240);
    expect(result.discountAmount).toEqual({ amount: 24, currency: 'BRL' });
    expect(result.pointsEarned).toBe(15);
    expect(result.lines[0].actualPriceCharged).toEqual({ amount: 76, currency: 'BRL' });
    expect(result.lines[1].actualPriceCharged).toBeNull();
  });

  it('leaves completion summary fields null for a non-COMPLETED booking', () => {
    const result = toCustomerBookingDetail({ ...backendDetail, status: 'APPROVED' });

    expect(result.completedAt).toBeNull();
    expect(result.totalActualPrice).toBeNull();
    expect(result.discountPointsUsed).toBeNull();
    expect(result.discountAmount).toBeNull();
    expect(result.pointsEarned).toBeNull();
  });
});

describe('toGuestBookingRead()', () => {
  const backendDetail: BookingDetailResponse = {
    id: BOOKING_ID,
    status: 'INFO_REQUESTED',
    type: 'GUEST',
    customerId: null,
    contactName: 'João da Silva',
    contactEmail: 'joao@example.com',
    contactPhone: '+5531999999999',
    contactAddress: null,
    notes: null,
    scheduledAt: '2026-06-18T13:00:00.000Z',
    totalDurationMins: 30,
    totalPrice: { amount: 100, currency: 'BRL' },
    totalActualPrice: null,
    discountPointsUsed: null,
    discountAmount: null,
    pickupAddress: null,
    lines: [
      {
        lineId: LINE_ID,
        serviceId: SERVICE_ID,
        serviceNameAtBooking: 'Lavagem Simples',
        priceAtBooking: { amount: 100, currency: 'BRL' },
        durationMinsAtBooking: 30,
        pointsValueAtBooking: 10,
        requiresPickupAddressAtBooking: false,
        actualPriceCharged: null,
      },
    ],
    beforeServicePhotoUrls: [],
    afterServicePhotoUrls: [],
    adminNotes: null,
    infoRequestMessage: 'Por favor, envie fotos do veículo antes da lavagem.',
    infoResponseMessage: null,
    approvedAt: null,
    approvedBy: null,
    completedAt: null,
    rejectionReason: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    cancellableUntil: null,
    pointsEarned: null,
  };

  it('maps backend booking detail fields to GuestBookingReadResponse', () => {
    const result = toGuestBookingRead(backendDetail);

    expect(result).toEqual({
      bookingId: BOOKING_ID,
      status: 'INFO_REQUESTED',
      serviceSummary: 'Lavagem Simples',
      scheduledAt: '2026-06-18T13:00:00.000Z',
      infoRequestMessage: 'Por favor, envie fotos do veículo antes da lavagem.',
      contactName: 'João da Silva',
    });
  });

  it('joins multiple line service names into serviceSummary', () => {
    const result = toGuestBookingRead({
      ...backendDetail,
      lines: [
        { ...backendDetail.lines[0], serviceNameAtBooking: 'Lavagem Simples' },
        { ...backendDetail.lines[0], lineId: 'other-line', serviceNameAtBooking: 'Cera' },
      ],
    });

    expect(result.serviceSummary).toBe('Lavagem Simples, Cera');
  });

  it('falls back to an empty string when infoRequestMessage is null', () => {
    const result = toGuestBookingRead({ ...backendDetail, infoRequestMessage: null });
    expect(result.infoRequestMessage).toBe('');
  });
});
