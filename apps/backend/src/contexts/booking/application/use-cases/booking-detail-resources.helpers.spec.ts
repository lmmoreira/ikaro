import { BookingBuilder, BookingLineBuilder } from '../../../../test/builders/booking/index';
import { ServiceBuilder } from '../../../../test/builders/booking/service.builder';
import { ResourceRequirement } from '../../domain/resource-requirement';
import { ResourceType } from '../../domain/resource.types';
import { Service } from '../../domain/service.aggregate';
import { ServiceLeg } from '../../domain/service-leg';
import { BookingLineResourceAssignment } from '../ports/booking-repository.port';
import { BookingLineOccupancyRow } from '../ports/resource-occupancy-repository.port';
import { buildBookingDetailResources } from './booking-detail-resources.helpers';

const TENANT = '10000000-0000-4000-8000-000000000471';
const LINE_ID = '30000000-0000-4000-8000-000000000471';

function bookingWith(service: Service) {
  const line = new BookingLineBuilder()
    .withLineId(LINE_ID)
    .withTenantId(TENANT)
    .withServiceId(service.id)
    .withServiceNameAtBooking(service.name)
    .build();
  return new BookingBuilder().withTenantId(TENANT).withLines([line]).build();
}

function assignment(
  overrides: Partial<BookingLineResourceAssignment>,
): BookingLineResourceAssignment {
  return {
    bookingLineId: LINE_ID,
    resourceId: 'res-1',
    resourceType: ResourceType.ROOM,
    resourceName: 'Sala Aurora',
    legIndex: null,
    quantityPosition: null,
    ...overrides,
  };
}

function occupancyRow(overrides: Partial<BookingLineOccupancyRow>): BookingLineOccupancyRow {
  return {
    bookingLineId: LINE_ID,
    resourceId: 'res-1',
    resourceType: ResourceType.ROOM,
    resourceName: 'Sala Aurora',
    legIndex: 0,
    quantityPosition: null,
    startsAt: new Date('2026-06-16T09:00:00.000Z'),
    endsAt: new Date('2026-06-16T09:40:00.000Z'),
    lockState: 'COMMITTED',
    holdExpiresAt: null,
    gapMinutes: null,
    gapSource: null,
    ...overrides,
  };
}

function requirement(type: ResourceType, selectionMode: ResourceRequirement['selectionMode']) {
  return ResourceRequirement.create({ type, selectionMode });
}

describe('buildBookingDetailResources', () => {
  describe('flat requirements', () => {
    it('tags a chosen resource and a system-assigned one', () => {
      const service = new ServiceBuilder()
        .withTenantId(TENANT)
        .withResourceRequirements([
          requirement(ResourceType.ROOM, 'CUSTOMER_CHOICE'),
          requirement(ResourceType.STAFF, 'AUTO_ANY'),
        ])
        .build();

      const { resources, itinerary } = buildBookingDetailResources({
        booking: bookingWith(service),
        serviceMap: new Map([[service.id, service]]),
        assignments: [
          assignment({}),
          assignment({
            resourceId: 'staff-1',
            resourceType: ResourceType.STAFF,
            resourceName: 'Marcos Lima',
          }),
        ],
        occupancyRows: [],
      });

      expect(itinerary).toEqual([]);
      expect(resources).toEqual([
        expect.objectContaining({
          resourceType: ResourceType.ROOM,
          resourceName: 'Sala Aurora',
          origin: 'CUSTOMER_CHOICE',
          quantity: null,
        }),
        expect.objectContaining({
          resourceType: ResourceType.STAFF,
          resourceName: 'Marcos Lima',
          origin: 'SYSTEM_ASSIGNED',
        }),
      ]);
    });

    it('shows a fungible pool as one entry with the reserved quantity and no unit name', () => {
      const service = new ServiceBuilder()
        .withTenantId(TENANT)
        .withResourceRequirements([requirement(ResourceType.EQUIPMENT, 'AUTO_FUNGIBLE_POOL')])
        .build();

      const { resources } = buildBookingDetailResources({
        booking: bookingWith(service),
        serviceMap: new Map([[service.id, service]]),
        assignments: [
          assignment({
            resourceId: 'chair-1',
            resourceType: ResourceType.EQUIPMENT,
            resourceName: 'Cadeira 1',
            quantityPosition: 0,
          }),
          assignment({
            resourceId: 'chair-2',
            resourceType: ResourceType.EQUIPMENT,
            resourceName: 'Cadeira 2',
            quantityPosition: 1,
          }),
        ],
        occupancyRows: [],
      });

      expect(resources).toEqual([
        expect.objectContaining({
          resourceType: ResourceType.EQUIPMENT,
          resourceName: null,
          origin: null,
          quantity: 2,
        }),
      ]);
    });

    it('leaves the origin untagged when the service no longer declares that requirement', () => {
      const service = new ServiceBuilder()
        .withTenantId(TENANT)
        .withResourceRequirements([])
        .build();

      const { resources } = buildBookingDetailResources({
        booking: bookingWith(service),
        serviceMap: new Map([[service.id, service]]),
        assignments: [assignment({})],
        occupancyRows: [],
      });

      expect(resources).toEqual([
        expect.objectContaining({ resourceName: 'Sala Aurora', origin: null }),
      ]);
    });

    it('shows nothing for the default shape (a single location with no resource field)', () => {
      const service = new ServiceBuilder()
        .withTenantId(TENANT)
        .withResourceRequirements([requirement(ResourceType.LOCATION, 'NONE')])
        .build();

      const { resources } = buildBookingDetailResources({
        booking: bookingWith(service),
        serviceMap: new Map([[service.id, service]]),
        assignments: [
          assignment({ resourceType: ResourceType.LOCATION, resourceName: 'Unidade principal' }),
        ],
        occupancyRows: [],
      });

      expect(resources).toEqual([]);
    });

    it('returns empty lists when there are no assignments', () => {
      const service = new ServiceBuilder().withTenantId(TENANT).build();

      expect(
        buildBookingDetailResources({
          booking: bookingWith(service),
          serviceMap: new Map([[service.id, service]]),
          assignments: [],
          occupancyRows: [],
        }),
      ).toEqual({ resources: [], itinerary: [] });
    });
  });

  describe('legged service', () => {
    const van = requirement(ResourceType.EQUIPMENT, 'AUTO_ANY');
    const guide = requirement(ResourceType.STAFF, 'CUSTOMER_CHOICE');
    const legged = () =>
      new ServiceBuilder()
        .withTenantId(TENANT)
        .withLegs([
          ServiceLeg.create({
            legIndex: 0,
            name: 'Ida',
            durationMinutes: 40,
            resourceRequirements: [van],
          }),
          ServiceLeg.create({
            legIndex: 1,
            name: 'Passeio',
            durationMinutes: 90,
            resourceRequirements: [guide],
          }),
          ServiceLeg.create({
            legIndex: 2,
            name: 'Volta',
            durationMinutes: 40,
            resourceRequirements: [van],
          }),
        ])
        .build();
    const legAssignments = [
      assignment({
        resourceId: 'van-2',
        resourceType: ResourceType.EQUIPMENT,
        resourceName: 'Van 2',
        legIndex: 2,
      }),
      assignment({
        resourceId: 'guide-1',
        resourceType: ResourceType.STAFF,
        resourceName: 'Paula',
        legIndex: 1,
      }),
      assignment({
        resourceId: 'van-2',
        resourceType: ResourceType.EQUIPMENT,
        resourceName: 'Van 2',
        legIndex: 0,
      }),
    ];

    it('lists every leg in leg order, including a resource reused on two legs, with its times', () => {
      const service = legged();

      const { resources, itinerary } = buildBookingDetailResources({
        booking: bookingWith(service),
        serviceMap: new Map([[service.id, service]]),
        assignments: legAssignments,
        occupancyRows: [
          occupancyRow({ resourceId: 'van-2', legIndex: 0 }),
          occupancyRow({
            resourceId: 'guide-1',
            legIndex: 1,
            startsAt: new Date('2026-06-16T09:40:00.000Z'),
            endsAt: new Date('2026-06-16T11:10:00.000Z'),
          }),
        ],
      });

      expect(resources).toEqual([]);
      expect(itinerary.map((leg) => [leg.legIndex, leg.legName, leg.resourceName])).toEqual([
        [0, 'Ida', 'Van 2'],
        [1, 'Passeio', 'Paula'],
        [2, 'Volta', 'Van 2'],
      ]);
      expect(itinerary[0].startsAt).toBe('2026-06-16T09:00:00.000Z');
      expect(itinerary[1].endsAt).toBe('2026-06-16T11:10:00.000Z');
    });

    it('shows nothing for a leg whose requirement is the default NONE shape', () => {
      const service = new ServiceBuilder()
        .withTenantId(TENANT)
        .withLegs([
          ServiceLeg.create({
            legIndex: 0,
            name: 'Ida',
            durationMinutes: 40,
            resourceRequirements: [requirement(ResourceType.LOCATION, 'NONE')],
          }),
        ])
        .build();

      const { itinerary } = buildBookingDetailResources({
        booking: bookingWith(service),
        serviceMap: new Map([[service.id, service]]),
        assignments: [assignment({ resourceType: ResourceType.LOCATION, legIndex: 0 })],
        occupancyRows: [],
      });

      expect(itinerary).toEqual([]);
    });

    it('carries null times for a leg without a live occupancy row, never a derived time', () => {
      const service = legged();

      const { itinerary } = buildBookingDetailResources({
        booking: bookingWith(service),
        serviceMap: new Map([[service.id, service]]),
        assignments: legAssignments,
        occupancyRows: [],
      });

      expect(itinerary).toHaveLength(3);
      expect(itinerary.every((leg) => leg.startsAt === null && leg.endsAt === null)).toBe(true);
    });
  });
});
