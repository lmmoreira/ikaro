import { describe, expect, it } from 'vitest';
import type { AvailableSlot } from '@ikaro/types';
import {
  buildAuthenticatedBookingPayload,
  buildGuestBookingPayload,
  type BookingPayloadSelections,
} from './booking-payload';
import { emptyAddress, emptyPersonalInfo } from './personal-info';

const slot: AvailableSlot = {
  startsAt: '2026-10-05T13:00:00.000Z',
  endsAt: '2026-10-05T14:00:00.000Z',
};

function selections(overrides: Partial<BookingPayloadSelections> = {}): BookingPayloadSelections {
  return {
    serviceIds: ['s1', 's2'],
    slot,
    pickupAddress: emptyAddress(),
    requiresPickupAddress: false,
    resourcePicks: [],
    intakeFields: null,
    ...overrides,
  };
}

const info = {
  ...emptyPersonalInfo(),
  contactName: 'Ana',
  contactEmail: 'ana@example.com',
  contactPhone: '+5531999999999',
};

describe('buildGuestBookingPayload', () => {
  it('builds the base payload without any M23 field', () => {
    expect(buildGuestBookingPayload(info, selections(), true)).toEqual({
      contactName: 'Ana',
      contactEmail: 'ana@example.com',
      contactPhone: '+5531999999999',
      scheduledAt: slot.startsAt,
      serviceIds: ['s1', 's2'],
    });
  });

  it('sends resourceSelections in serviceIds order, the duration and the intake fields', () => {
    const payload = buildGuestBookingPayload(
      info,
      selections({
        resourcePicks: [
          { serviceId: 's2', legIndex: null, resourceType: 'STAFF', resourceId: 'b' },
          { serviceId: 's1', legIndex: null, resourceType: 'STAFF', resourceId: 'a' },
        ],
        durationMinutes: 90,
        intakeFields: {
          intakeSchemaVersion: 2,
          intakeAnswers: { goal: 'x' },
          consentAccepted: true,
        },
      }),
      true,
    );
    expect(payload.resourceSelections?.map((p) => p.resourceId)).toEqual(['a', 'b']);
    expect(payload.durationMinutes).toBe(90);
    expect(payload.intakeSchemaVersion).toBe(2);
    expect(payload.consentAccepted).toBe(true);
  });

  it('adds the pickup address and photos only when present', () => {
    const address = {
      ...emptyAddress(),
      street: 'Rua A',
      number: '1',
      city: 'BH',
      state: 'MG',
      zipCode: '30000-000',
    };
    const payload = buildGuestBookingPayload(
      { ...info, photoFilePaths: ['p.png'] },
      selections({ requiresPickupAddress: true, pickupAddress: address }),
      false,
    );
    expect(payload.pickupAddress?.street).toBe('Rua A');
    expect(payload.beforeServicePhotoUrls).toEqual(['p.png']);
  });
});

describe('buildAuthenticatedBookingPayload', () => {
  it('builds the same M23 fields without contact data', () => {
    const payload = buildAuthenticatedBookingPayload(
      [],
      selections({
        resourcePicks: [{ serviceId: 's1', legIndex: 1, resourceType: 'ROOM', resourceId: 'r' }],
        durationMinutes: 60,
      }),
    );
    expect(payload).toEqual({
      scheduledAt: slot.startsAt,
      serviceIds: ['s1', 's2'],
      resourceSelections: [{ serviceId: 's1', legIndex: 1, resourceType: 'ROOM', resourceId: 'r' }],
      durationMinutes: 60,
    });
  });
});
