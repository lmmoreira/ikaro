import { ResourceType } from '../../domain/resource.types';
import {
  BookingBuilder,
  BookingLineBuilder,
  ServiceBuilder,
} from '../../../../test/builders/booking/index';
import { Money } from '../../../../shared/value-objects/money';
import { BookingServiceNotInTenantError } from '../../domain/errors/booking-domain.error';
import { buildLineInputs, toBookingResult } from './booking-request.mapper';

const TENANT_A = '10000000-0000-4000-8000-000000000100';

describe('buildLineInputs', () => {
  it('maps each serviceId to a BookingLineInput snapshotted from the service map', () => {
    const service = new ServiceBuilder()
      .withTenantId(TENANT_A)
      .withName('Lavagem Completa')
      .withPrice(Money.from(150, 'BRL'))
      .build();
    const serviceMap = new Map([[service.id, service]]);

    const result = buildLineInputs([service.id], serviceMap);

    expect(result).toEqual([
      {
        serviceId: service.id,
        serviceNameAtBooking: service.name,
        priceAtBooking: service.price,
        durationMinsAtBooking: service.durationMinutes,
        pointsValueAtBooking: service.loyaltyPointsValue,
        requiresPickupAddressAtBooking: service.requiresPickupAddress,
      },
    ]);
  });

  it('throws BookingServiceNotInTenantError when a serviceId is not in the map', () => {
    expect(() => buildLineInputs(['missing-service-id'], new Map())).toThrow(
      BookingServiceNotInTenantError,
    );
  });
});

describe('toBookingResult', () => {
  it('maps a Booking without a pickup address', () => {
    const booking = new BookingBuilder()
      .withTenantId(TENANT_A)
      .withLines([new BookingLineBuilder().build()])
      .build();

    const result = toBookingResult(booking, new Map());

    expect(result.bookingId).toBe(booking.id);
    expect(result.status).toBe(booking.status);
    expect(result.pickupAddress).toBeNull();
    expect(result.lines).toHaveLength(1);
    expect(result.lines[0].serviceId).toBe(booking.lines[0].serviceId);
    expect(result.lines[0].assignedResourceName).toBeUndefined();
    expect(result.lines[0].itinerary).toBeUndefined();
  });

  it('reveals assignedResourceName for a flat AUTO_ANY candidate but not a pool one', () => {
    const line = new BookingLineBuilder().build();
    const booking = new BookingBuilder().withTenantId(TENANT_A).withLines([line]).build();
    const autoAnyCandidates = new Map([
      [
        line.lineId,
        {
          isDegenerate: false,
          candidates: [
            {
              resourceId: 'resource-1',
              resourceType: ResourceType.ROOM,
              resourceName: 'Ana Souza',
              legIndex: null,
              quantityPosition: null,
              startsAt: new Date(),
              endsAt: new Date(),
              selectionMode: 'AUTO_ANY' as const,
              isBundleMember: false,
            },
          ],
        },
      ],
    ]);
    const poolCandidates = new Map([
      [
        line.lineId,
        {
          isDegenerate: false,
          candidates: [
            {
              resourceId: 'resource-2',
              resourceType: ResourceType.ROOM,
              resourceName: 'Quadra 1',
              legIndex: null,
              quantityPosition: null,
              startsAt: new Date(),
              endsAt: new Date(),
              selectionMode: 'AUTO_FUNGIBLE_POOL' as const,
              isBundleMember: false,
            },
          ],
        },
      ],
    ]);

    expect(toBookingResult(booking, autoAnyCandidates).lines[0].assignedResourceName).toBe(
      'Ana Souza',
    );
    expect(toBookingResult(booking, poolCandidates).lines[0].assignedResourceName).toBeUndefined();
  });

  it('always reveals the full itinerary for a legged line, regardless of selectionMode', () => {
    const line = new BookingLineBuilder().build();
    const booking = new BookingBuilder().withTenantId(TENANT_A).withLines([line]).build();
    const legStart = new Date('2026-06-01T10:00:00.000Z');
    const legEnd = new Date('2026-06-01T10:20:00.000Z');
    const candidatesByLine = new Map([
      [
        line.lineId,
        {
          isDegenerate: false,
          candidates: [
            {
              resourceId: 'resource-1',
              resourceType: ResourceType.ROOM,
              resourceName: 'Sala 1',
              legIndex: 1,
              quantityPosition: null,
              startsAt: legEnd,
              endsAt: new Date(legEnd.getTime() + 20 * 60_000),
              selectionMode: 'CUSTOMER_CHOICE' as const,
              isBundleMember: false,
            },
            {
              resourceId: 'resource-0',
              resourceType: ResourceType.EQUIPMENT,
              resourceName: 'Equipamento 1',
              legIndex: 0,
              quantityPosition: null,
              startsAt: legStart,
              endsAt: legEnd,
              selectionMode: 'AUTO_ANY' as const,
              isBundleMember: false,
            },
          ],
        },
      ],
    ]);

    const result = toBookingResult(booking, candidatesByLine);

    expect(result.lines[0].assignedResourceName).toBeUndefined();
    expect(result.lines[0].itinerary).toEqual([
      {
        legIndex: 0,
        resourceName: 'Equipamento 1',
        startsAt: legStart.toISOString(),
        endsAt: legEnd.toISOString(),
      },
      {
        legIndex: 1,
        resourceName: 'Sala 1',
        startsAt: legEnd.toISOString(),
        endsAt: new Date(legEnd.getTime() + 20 * 60_000).toISOString(),
      },
    ]);
  });
});
