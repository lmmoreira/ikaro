import type { BookingLineResourceEntry } from '@ikaro/types';
import { toCustomerDetailExtras, toStaffDetailExtras } from './bookings-detail.mapper';
import { BookingDetailResponse } from './bookings.types';

const baseDetail: BookingDetailResponse = {
  id: '10000000-0000-4000-8000-000000000471',
  status: 'CANCELLED',
  type: 'CUSTOMER',
  customerId: '20000000-0000-4000-8000-000000000471',
  contactName: 'João Silva',
  contactEmail: 'joao@example.com',
  contactPhone: '+5511987654321',
  contactAddress: null,
  notes: 'Carro com película.',
  scheduledAt: '2026-06-16T10:00:00.000Z',
  totalDurationMins: 30,
  totalPrice: { amount: 60, currency: 'BRL' },
  totalActualPrice: null,
  discountPointsUsed: null,
  discountAmount: null,
  pickupAddress: null,
  lines: [],
  beforeServicePhotoUrls: [],
  afterServicePhotoUrls: [],
  beforeServicePhotoPaths: [],
  afterServicePhotoPaths: [],
  adminNotes: 'Cliente pediu a vaga coberta.',
  infoRequestMessage: null,
  infoResponseMessage: null,
  approvedAt: null,
  approvedBy: null,
  completedAt: null,
  rejectionReason: null,
  createdAt: '2026-06-14T09:12:00.000Z',
  cancellableUntil: null,
  reschedule: null,
  pointsEarned: null,
  statusHistory: null,
  hasOpenException: null,
  resources: [
    {
      lineId: 'line-1',
      serviceName: 'Reserva de sala',
      resourceType: 'ROOM',
      resourceName: 'Sala Aurora',
      origin: 'CUSTOMER_CHOICE',
      quantity: null,
    },
  ],
  itinerary: [],
  participantCount: 2,
  attendees: [
    { name: 'Maria', isMinor: false },
    { name: 'Pedro', isMinor: true },
  ],
  intake: {
    schemaVersion: 2,
    answers: [{ fieldKey: 'level', label: 'Nível', type: 'FREE_TEXT', value: 'Iniciante' }],
    consentAcceptedAt: '2026-06-10T14:02:00.000Z',
    consentVersion: 2,
  },
  recurringScheduleId: 'schedule-1',
  createdByStaffId: '30000000-0000-4000-8000-000000000471',
  createdByName: 'Ana Pereira',
  cancellation: {
    at: '2026-06-16T08:40:00.000Z',
    reason: 'Equipamento em manutenção.',
    byCustomer: false,
    actorId: '30000000-0000-4000-8000-000000000471',
    actorName: 'Ana Pereira',
  },
  rejection: null,
};

describe('toStaffDetailExtras()', () => {
  it('carries every field of the full detail, including the internal ones', () => {
    const extras = toStaffDetailExtras(baseDetail);

    expect(extras).toMatchObject({
      notes: 'Carro com película.',
      adminNotes: 'Cliente pediu a vaga coberta.',
      createdAt: '2026-06-14T09:12:00.000Z',
      createdByName: 'Ana Pereira',
      participantCount: 2,
      recurringScheduleId: 'schedule-1',
      intake: { schemaVersion: 2, consentVersion: 2 },
    });
    expect(extras.resources).toHaveLength(1);
    expect(extras.attendees).toHaveLength(2);
  });

  it('names a staff cancel actor and a customer cancel actor by kind', () => {
    expect(toStaffDetailExtras(baseDetail).cancellation).toEqual({
      at: '2026-06-16T08:40:00.000Z',
      reason: 'Equipamento em manutenção.',
      by: { kind: 'STAFF', name: 'Ana Pereira' },
    });

    const byCustomer = toStaffDetailExtras({
      ...baseDetail,
      cancellation: {
        at: '2026-06-16T08:40:00.000Z',
        reason: null,
        byCustomer: true,
        actorId: baseDetail.customerId,
        actorName: 'João Silva',
      },
    });
    expect(byCustomer.cancellation?.by).toEqual({ kind: 'CUSTOMER', name: 'João Silva' });
  });

  it('defaults absent lists to empty and absent blocks to null for an older backend', () => {
    const extras = toStaffDetailExtras({
      ...baseDetail,
      resources: null,
      itinerary: null,
      attendees: null,
      intake: null,
      cancellation: null,
    });

    expect(extras).toMatchObject({
      resources: [],
      itinerary: [],
      attendees: [],
      intake: null,
      cancellation: null,
    });
  });
});

describe('toCustomerDetailExtras()', () => {
  it('never carries internal notes, the creator, the consent version or an actor id or name (negative guarantee)', () => {
    const extras = toCustomerDetailExtras(baseDetail);
    const serialized = JSON.stringify(extras);

    expect(extras).not.toHaveProperty('adminNotes');
    expect(extras).not.toHaveProperty('createdByStaffId');
    expect(extras).not.toHaveProperty('createdByName');
    expect(extras).not.toHaveProperty('createdAt');
    expect(extras.intake).not.toHaveProperty('consentVersion');
    expect(extras.cancellation).not.toHaveProperty('actorId');
    expect(extras.cancellation).not.toHaveProperty('actorName');
    expect(serialized).not.toContain('Ana Pereira');
    expect(serialized).not.toContain('Cliente pediu a vaga coberta.');
    expect(serialized).not.toContain('30000000-0000-4000-8000-000000000471');
  });

  it('carries the customer-visible subset', () => {
    expect(toCustomerDetailExtras(baseDetail)).toMatchObject({
      participantCount: 2,
      recurringScheduleId: 'schedule-1',
      intake: { schemaVersion: 2, consentAcceptedAt: '2026-06-10T14:02:00.000Z' },
    });
  });

  it('tells the customer a cancellation reason only when the establishment cancelled', () => {
    expect(toCustomerDetailExtras(baseDetail).cancellation).toEqual({
      at: '2026-06-16T08:40:00.000Z',
      byCustomer: false,
      reason: 'Equipamento em manutenção.',
    });

    const own = toCustomerDetailExtras({
      ...baseDetail,
      cancellation: {
        at: '2026-06-16T08:40:00.000Z',
        reason: 'stray reason',
        byCustomer: true,
        actorId: baseDetail.customerId,
        actorName: 'João Silva',
      },
    });
    expect(own.cancellation).toEqual({
      at: '2026-06-16T08:40:00.000Z',
      byCustomer: true,
      reason: null,
    });
  });

  it('carries the rejection reason the business gave, without the actor', () => {
    const extras = toCustomerDetailExtras({
      ...baseDetail,
      status: 'REJECTED',
      cancellation: null,
      rejection: {
        at: '2026-06-15T17:20:00.000Z',
        reason: 'Não atendemos esse tipo de veículo.',
        byCustomer: false,
        actorId: '30000000-0000-4000-8000-000000000471',
        actorName: 'Ana Pereira',
      },
    });

    expect(extras.rejection).toEqual({
      at: '2026-06-15T17:20:00.000Z',
      reason: 'Não atendemos esse tipo de veículo.',
    });
  });

  it('keeps a chosen or assigned resource and a pool, but hides a named resource of a requirement the service no longer declares', () => {
    const entry = (overrides: Partial<BookingLineResourceEntry>): BookingLineResourceEntry => ({
      lineId: 'line-1',
      serviceName: 'Reserva de sala',
      resourceType: 'ROOM' as const,
      resourceName: 'Sala Aurora',
      origin: 'CUSTOMER_CHOICE' as const,
      quantity: null,
      ...overrides,
    });
    const extras = toCustomerDetailExtras({
      ...baseDetail,
      resources: [
        entry({}),
        entry({ resourceType: 'STAFF', resourceName: 'Marcos Lima', origin: 'SYSTEM_ASSIGNED' }),
        entry({ resourceType: 'EQUIPMENT', resourceName: null, origin: null, quantity: 2 }),
        entry({ resourceType: 'ROOM', resourceName: 'Sala Antiga', origin: null }),
      ],
    });

    expect(extras.resources.map((r) => r.resourceName)).toEqual([
      'Sala Aurora',
      'Marcos Lima',
      null,
    ]);
  });

  it('shows the staff every resource, including one with no origin tag', () => {
    const extras = toStaffDetailExtras({
      ...baseDetail,
      resources: [
        {
          lineId: 'line-1',
          serviceName: 'Reserva de sala',
          resourceType: 'ROOM',
          resourceName: 'Sala Antiga',
          origin: null,
          quantity: null,
        },
      ],
    });

    expect(extras.resources).toHaveLength(1);
  });

  it('carries the pickup address, which the customer read did not have before', () => {
    const pickupAddress = {
      street: 'Rua das Flores',
      number: '120',
      complement: null,
      neighborhood: 'Pinheiros',
      city: 'São Paulo',
      state: 'SP',
      zipCode: '05422-000',
    };

    expect(toCustomerDetailExtras({ ...baseDetail, pickupAddress }).pickupAddress).toEqual(
      pickupAddress,
    );
  });
});
