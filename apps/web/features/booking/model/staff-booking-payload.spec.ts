import { describe, expect, it } from 'vitest';
import type { AvailableSlot } from '@ikaro/types';
import type { BookingPayloadSelections } from './booking-payload';
import { emptyAddress } from './personal-info';
import { buildStaffBookingPayload } from './staff-booking-payload';

const SLOT: AvailableSlot = {
  startsAt: '2026-06-15T12:00:00.000Z',
  endsAt: '2026-06-15T12:30:00.000Z',
};

function selections(overrides: Partial<BookingPayloadSelections> = {}): BookingPayloadSelections {
  return {
    serviceIds: ['svc-1'],
    slot: SLOT,
    pickupAddress: emptyAddress(),
    requiresPickupAddress: false,
    resourcePicks: [],
    intakeFields: null,
    ...overrides,
  };
}

describe('buildStaffBookingPayload', () => {
  it('sends customerId and no contact field for a registered customer', () => {
    const payload = buildStaffBookingPayload(
      { kind: 'customer', customerId: 'cust-1' },
      selections(),
    );

    expect(payload).toEqual({
      scheduledAt: SLOT.startsAt,
      serviceIds: ['svc-1'],
      customerId: 'cust-1',
    });
  });

  it('sends the contact trio and no customerId for a guest', () => {
    const payload = buildStaffBookingPayload(
      {
        kind: 'guest',
        contactName: 'Maria',
        contactPhone: '+5531999990000',
        contactEmail: 'maria@example.com',
      },
      selections(),
    );

    expect(payload).toMatchObject({
      contactName: 'Maria',
      contactPhone: '+5531999990000',
      contactEmail: 'maria@example.com',
    });
    expect(payload).not.toHaveProperty('customerId');
  });

  it('never carries photos or a contact address', () => {
    const payload = buildStaffBookingPayload(
      { kind: 'customer', customerId: 'cust-1' },
      selections(),
    );

    expect(payload).not.toHaveProperty('beforeServicePhotoUrls');
    expect(payload).not.toHaveProperty('contactAddress');
  });

  it('sends the pickup address only when a chosen service requires it, without an empty neighbourhood', () => {
    const address = {
      ...emptyAddress(),
      street: 'Rua A',
      number: '1',
      city: 'BH',
      state: 'MG',
      zipCode: '30000000',
    };

    const required = buildStaffBookingPayload(
      { kind: 'customer', customerId: 'cust-1' },
      selections({ requiresPickupAddress: true, pickupAddress: address }),
    );
    const notRequired = buildStaffBookingPayload(
      { kind: 'customer', customerId: 'cust-1' },
      selections({ requiresPickupAddress: false, pickupAddress: address }),
    );

    expect(required).toMatchObject({ pickupAddress: { street: 'Rua A' } });
    expect(
      (required as { pickupAddress: { neighborhood?: string } }).pickupAddress.neighborhood,
    ).toBeUndefined();
    expect(notRequired).not.toHaveProperty('pickupAddress');
  });

  it('carries the resource picks, the duration and the intake fields', () => {
    const payload = buildStaffBookingPayload(
      { kind: 'customer', customerId: 'cust-1' },
      selections({
        resourcePicks: [{ serviceId: 'svc-1', resourceType: 'STAFF', resourceId: 'res-1' }],
        durationMinutes: 90,
        intakeFields: { intakeSchemaVersion: 2, intakeAnswers: { q: 'a' } },
      }),
    );

    expect(payload).toMatchObject({
      resourceSelections: [{ serviceId: 'svc-1', resourceType: 'STAFF', resourceId: 'res-1' }],
      durationMinutes: 90,
      intakeSchemaVersion: 2,
      intakeAnswers: { q: 'a' },
    });
  });
});
