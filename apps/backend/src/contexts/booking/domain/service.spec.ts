import { Money } from '../../../shared/value-objects/money';
import { ServiceBuilder } from '../../../test/builders/booking/index';
import { ClassResourceSlot } from './class-resource-slot';
import {
  BookingDomainError,
  BookingServiceBookingModelImmutableError,
  BookingServiceBookingModelMismatchError,
  BookingServiceHasLegsError,
  BookingServiceLegsTooFewError,
  BookingServiceResourceTypeUnavailableError,
  ClassResourceSlotDuplicateTypeError,
  ClassResourceSlotResourceNotActiveError,
  ResourceRequirementInvalidError,
  ServiceBufferAfterMinutesInvalidError,
  ServiceDeactivatedError,
  ServiceLegInvalidError,
} from './errors/booking-domain.error';
import { ActiveResourceIdsByType } from './resource-requirement-availability';
import { ResourceRequirement } from './resource-requirement';
import { ResourceType } from './resource.types';
import { Service } from './service.aggregate';
import { ServiceLeg } from './service-leg';

function requirement(type: ResourceType = ResourceType.STAFF): ResourceRequirement {
  return ResourceRequirement.create({ type, selectionMode: 'CUSTOMER_CHOICE' });
}

function leg(legIndex: number, type: ResourceType = ResourceType.ROOM): ServiceLeg {
  return ServiceLeg.create({
    legIndex,
    name: `Etapa ${legIndex}`,
    durationMinutes: 20,
    resourceRequirements: [ResourceRequirement.create({ type, selectionMode: 'AUTO_ANY' })],
    transitionGapAfterMinutes: 5,
  });
}

// Builds the "every active resource id per type" map setResourceRequirements()/setLegs() expect.
// None of these tests exercise resourcePoolIds, so a single placeholder id per type is enough.
function activeIds(...types: ResourceType[]): ActiveResourceIdsByType {
  return new Map(types.map((type) => [type, new Set(['resource-1'])]));
}

const TENANT = 'tenant-abc';
const PRICE = Money.from(150, 'BRL');
const DURATION = 60;
const POINTS = 10;

describe('Service', () => {
  describe('create()', () => {
    it('creates an active service with correct properties', () => {
      const service = new ServiceBuilder()
        .withTenantId(TENANT)
        .withName('Lavagem Completa')
        .withPrice(PRICE)
        .withDurationMinutes(DURATION)
        .withLoyaltyPointsValue(POINTS)
        .withDescription('Descrição')
        .build();

      expect(service.id).toBeDefined();
      expect(service.tenantId).toBe(TENANT);
      expect(service.name).toBe('Lavagem Completa');
      expect(service.description).toBe('Descrição');
      expect(service.price).toBeInstanceOf(Money);
      expect(service.price.amount.toNumber()).toBe(150);
      expect(service.durationMinutes).toBe(60);
      expect(service.loyaltyPointsValue).toBe(10);
      expect(service.requiresPickupAddress).toBe(false);
      expect(service.isActive).toBe(true);
      expect(service.createdAt).toBeInstanceOf(Date);
      expect(service.updatedAt).toBeInstanceOf(Date);
    });

    it('defaults requiresPickupAddress to false when omitted', () => {
      const service = Service.create({
        tenantId: TENANT,
        name: 'Lavagem',
        price: PRICE,
        durationMinutes: DURATION,
        loyaltyPointsValue: POINTS,
      });
      expect(service.requiresPickupAddress).toBe(false);
    });

    it('defaults description to null when omitted', () => {
      const service = Service.create({
        tenantId: TENANT,
        name: 'Lavagem',
        price: PRICE,
        durationMinutes: DURATION,
        loyaltyPointsValue: POINTS,
      });
      expect(service.description).toBeNull();
    });

    it('trims whitespace from name', () => {
      const service = Service.create({
        tenantId: TENANT,
        name: '  Lavagem Completa  ',
        price: PRICE,
        durationMinutes: DURATION,
        loyaltyPointsValue: POINTS,
      });
      expect(service.name).toBe('Lavagem Completa');
    });

    it('price.format() returns pt-BR formatted string', () => {
      const service = new ServiceBuilder().withTenantId(TENANT).withPrice(PRICE).build();
      expect(service.price.format('pt-BR')).toBe('R$\u00A0150,00');
    });

    it('stores no domain events on creation', () => {
      const service = new ServiceBuilder().withTenantId(TENANT).build();
      expect(service.clearDomainEvents()).toHaveLength(0);
    });

    it('throws when tenantId is empty', () => {
      expect(() =>
        Service.create({
          tenantId: '',
          name: 'Lavagem',
          price: PRICE,
          durationMinutes: DURATION,
          loyaltyPointsValue: POINTS,
        }),
      ).toThrow(BookingDomainError);
    });

    it('throws when name is empty', () => {
      expect(() =>
        Service.create({
          tenantId: TENANT,
          name: '',
          price: PRICE,
          durationMinutes: DURATION,
          loyaltyPointsValue: POINTS,
        }),
      ).toThrow(BookingDomainError);
    });

    it('throws when name is whitespace-only', () => {
      expect(() =>
        Service.create({
          tenantId: TENANT,
          name: '   ',
          price: PRICE,
          durationMinutes: DURATION,
          loyaltyPointsValue: POINTS,
        }),
      ).toThrow(BookingDomainError);
    });

    it('throws when price amount is zero', () => {
      expect(() =>
        Service.create({
          tenantId: TENANT,
          name: 'Lavagem',
          price: Money.from(0, 'BRL'),
          durationMinutes: DURATION,
          loyaltyPointsValue: POINTS,
        }),
      ).toThrow(BookingDomainError);
    });

    it('throws when price amount is negative', () => {
      expect(() =>
        Service.create({
          tenantId: TENANT,
          name: 'Lavagem',
          price: Money.from(-10, 'BRL'),
          durationMinutes: DURATION,
          loyaltyPointsValue: POINTS,
        }),
      ).toThrow(BookingDomainError);
    });

    it('throws when durationMinutes is zero', () => {
      expect(() =>
        Service.create({
          tenantId: TENANT,
          name: 'Lavagem',
          price: PRICE,
          durationMinutes: 0,
          loyaltyPointsValue: POINTS,
        }),
      ).toThrow(BookingDomainError);
    });

    it('throws when durationMinutes is negative', () => {
      expect(() =>
        Service.create({
          tenantId: TENANT,
          name: 'Lavagem',
          price: PRICE,
          durationMinutes: -5,
          loyaltyPointsValue: POINTS,
        }),
      ).toThrow(BookingDomainError);
    });

    it('throws when loyaltyPointsValue is negative', () => {
      expect(() =>
        Service.create({
          tenantId: TENANT,
          name: 'Lavagem',
          price: PRICE,
          durationMinutes: DURATION,
          loyaltyPointsValue: -1,
        }),
      ).toThrow(BookingDomainError);
    });

    it('allows loyaltyPointsValue of zero', () => {
      const service = Service.create({
        tenantId: TENANT,
        name: 'Lavagem',
        price: PRICE,
        durationMinutes: DURATION,
        loyaltyPointsValue: 0,
      });
      expect(service.loyaltyPointsValue).toBe(0);
    });

    it('rejects classResourceSlots listing the same type more than once (round-trip integrity — type is the persistence grouping key)', () => {
      expect(() =>
        Service.create({
          tenantId: TENANT,
          name: 'Yoga',
          price: PRICE,
          durationMinutes: DURATION,
          loyaltyPointsValue: POINTS,
          bookingModel: 'SESSION',
          classResourceSlots: [
            ClassResourceSlot.create({ type: ResourceType.ROOM, eligibleResourceIds: ['r-1'] }),
            ClassResourceSlot.create({ type: ResourceType.ROOM, eligibleResourceIds: ['r-2'] }),
          ],
        }),
      ).toThrow(ClassResourceSlotDuplicateTypeError);
    });

    it('accepts classResourceSlots with distinct types, each an active resource of the matching type', () => {
      const service = Service.create({
        tenantId: TENANT,
        name: 'Yoga',
        price: PRICE,
        durationMinutes: DURATION,
        loyaltyPointsValue: POINTS,
        bookingModel: 'SESSION',
        classResourceSlots: [
          ClassResourceSlot.create({ type: ResourceType.ROOM, eligibleResourceIds: ['r-1'] }),
          ClassResourceSlot.create({ type: ResourceType.STAFF, eligibleResourceIds: ['r-2'] }),
        ],
        activeResourceIdsByType: new Map([
          [ResourceType.ROOM, new Set(['r-1'])],
          [ResourceType.STAFF, new Set(['r-2'])],
        ]),
      });
      expect(service.classResourceSlots).toHaveLength(2);
    });

    it('rejects a classResourceSlots type with no active resources', () => {
      expect(() =>
        Service.create({
          tenantId: TENANT,
          name: 'Yoga',
          price: PRICE,
          durationMinutes: DURATION,
          loyaltyPointsValue: POINTS,
          bookingModel: 'SESSION',
          classResourceSlots: [
            ClassResourceSlot.create({ type: ResourceType.ROOM, eligibleResourceIds: ['r-1'] }),
          ],
        }),
      ).toThrow(BookingServiceResourceTypeUnavailableError);
    });

    it('rejects a classResourceSlots eligibleResourceIds entry that is not an active resource', () => {
      expect(() =>
        Service.create({
          tenantId: TENANT,
          name: 'Yoga',
          price: PRICE,
          durationMinutes: DURATION,
          loyaltyPointsValue: POINTS,
          bookingModel: 'SESSION',
          classResourceSlots: [
            ClassResourceSlot.create({
              type: ResourceType.ROOM,
              eligibleResourceIds: ['not-active'],
            }),
          ],
          activeResourceIdsByType: new Map([[ResourceType.ROOM, new Set(['r-1'])]]),
        }),
      ).toThrow(ClassResourceSlotResourceNotActiveError);
    });
  });

  describe('reconstitute()', () => {
    it('reconstructs aggregate without validation', () => {
      const now = new Date();
      const service = Service.reconstitute({
        id: 'some-id',
        tenantId: TENANT,
        name: 'Lavagem',
        description: null,
        price: PRICE,
        durationMinutes: 30,
        loyaltyPointsValue: 5,
        requiresPickupAddress: true,
        isActive: false,
        createdAt: now,
        updatedAt: now,
        bookingModel: 'APPOINTMENT',
        resourceRequirements: [],
        bufferAfterMinutes: 60,
        legs: null,
        classResourceSlots: null,
      });
      expect(service.id).toBe('some-id');
      expect(service.isActive).toBe(false);
      expect(service.requiresPickupAddress).toBe(true);
    });
  });

  describe('update()', () => {
    let service: Service;

    beforeEach(() => {
      service = new ServiceBuilder()
        .withTenantId(TENANT)
        .withName('Lavagem Completa')
        .withPrice(PRICE)
        .withDurationMinutes(DURATION)
        .withLoyaltyPointsValue(POINTS)
        .withDescription('Descrição')
        .build();
    });

    it('updates all mutable fields', () => {
      const newPrice = Money.from(200, 'BRL');
      service.update('Lavagem Premium', 'Nova desc', newPrice, 90, 20, true);
      expect(service.name).toBe('Lavagem Premium');
      expect(service.description).toBe('Nova desc');
      expect(service.price.amount.toNumber()).toBe(200);
      expect(service.durationMinutes).toBe(90);
      expect(service.loyaltyPointsValue).toBe(20);
      expect(service.requiresPickupAddress).toBe(true);
    });

    it('updates updatedAt timestamp', () => {
      const before = service.updatedAt;
      service.update('Novo Nome', null, PRICE, DURATION, POINTS, false);
      expect(service.updatedAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
    });

    it('accepts null description to clear it', () => {
      service.update('Lavagem', null, PRICE, DURATION, POINTS, false);
      expect(service.description).toBeNull();
    });

    it('throws ServiceDeactivatedError when service is inactive', () => {
      service.deactivate();
      expect(() => service.update('Novo Nome', null, PRICE, DURATION, POINTS, false)).toThrow(
        ServiceDeactivatedError,
      );
    });

    it('throws when updated name is empty', () => {
      expect(() => service.update('', null, PRICE, DURATION, POINTS, false)).toThrow(
        BookingDomainError,
      );
    });

    it('throws when updated price is zero', () => {
      expect(() =>
        service.update('Lavagem', null, Money.from(0, 'BRL'), DURATION, POINTS, false),
      ).toThrow(BookingDomainError);
    });

    it('throws when updated durationMinutes is zero', () => {
      expect(() => service.update('Lavagem', null, PRICE, 0, POINTS, false)).toThrow(
        BookingDomainError,
      );
    });

    it('throws when updated loyaltyPointsValue is negative', () => {
      expect(() => service.update('Lavagem', null, PRICE, DURATION, -1, false)).toThrow(
        BookingDomainError,
      );
    });
  });

  describe('deactivate()', () => {
    let service: Service;

    beforeEach(() => {
      service = new ServiceBuilder().withTenantId(TENANT).build();
    });

    it('sets isActive to false', () => {
      service.deactivate();
      expect(service.isActive).toBe(false);
    });

    it('updates updatedAt timestamp', () => {
      const before = service.updatedAt;
      service.deactivate();
      expect(service.updatedAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
    });

    it('does not emit domain events', () => {
      service.deactivate();
      expect(service.clearDomainEvents()).toHaveLength(0);
    });
  });

  describe('setResourceRequirements()', () => {
    let service: Service;

    beforeEach(() => {
      service = new ServiceBuilder().withTenantId(TENANT).build();
    });

    it('sets a single flat resource requirement', () => {
      service.setResourceRequirements(
        [requirement(ResourceType.STAFF)],
        activeIds(ResourceType.STAFF),
      );
      expect(service.resourceRequirements).toHaveLength(1);
      expect(service.resourceRequirements[0].type).toBe(ResourceType.STAFF);
    });

    it('sets a bundle of 2+ requirements', () => {
      service.setResourceRequirements(
        [requirement(ResourceType.STAFF), requirement(ResourceType.EQUIPMENT)],
        activeIds(ResourceType.STAFF, ResourceType.EQUIPMENT),
      );
      expect(service.resourceRequirements).toHaveLength(2);
    });

    it('rejects a single resource requirement referencing a type with no active resources (UC-050 A1)', () => {
      expect(() =>
        service.setResourceRequirements([requirement(ResourceType.EQUIPMENT)], activeIds()),
      ).toThrow(BookingServiceResourceTypeUnavailableError);
    });

    it('rejects a bundle referencing a resource type with no active resources (UC-051)', () => {
      expect(() =>
        service.setResourceRequirements(
          [requirement(ResourceType.STAFF), requirement(ResourceType.EQUIPMENT)],
          activeIds(ResourceType.STAFF),
        ),
      ).toThrow(BookingServiceResourceTypeUnavailableError);
    });

    it('rejects when the service currently has legs (UC-050 A2)', () => {
      service.setLegs([leg(0), leg(1)], activeIds(ResourceType.ROOM));
      expect(() =>
        service.setResourceRequirements(
          [requirement(ResourceType.STAFF)],
          activeIds(ResourceType.STAFF),
        ),
      ).toThrow(BookingServiceHasLegsError);
    });

    it('rejects when the service is a SESSION (mutual exclusivity with classResourceSlots)', () => {
      const sessionService = new ServiceBuilder()
        .withTenantId(TENANT)
        .withBookingModel('SESSION')
        .withResourceRequirements([])
        .withBufferAfterMinutes(null)
        .withClassResourceSlots([])
        .build();
      expect(() =>
        sessionService.setResourceRequirements(
          [requirement(ResourceType.STAFF)],
          activeIds(ResourceType.STAFF),
        ),
      ).toThrow(BookingServiceBookingModelMismatchError);
    });

    it('rejects a duplicate resource type within the bundle', () => {
      expect(() =>
        service.setResourceRequirements(
          [requirement(ResourceType.STAFF), requirement(ResourceType.STAFF)],
          activeIds(ResourceType.STAFF),
        ),
      ).toThrow(ResourceRequirementInvalidError);
    });

    it('rejects a resourcePoolIds entry that is not an active resource of the matching type', () => {
      const withPool = ResourceRequirement.create({
        type: ResourceType.STAFF,
        selectionMode: 'CUSTOMER_CHOICE',
        resourcePoolIds: ['not-active-id'],
      });
      expect(() =>
        service.setResourceRequirements([withPool], activeIds(ResourceType.STAFF)),
      ).toThrow(ResourceRequirementInvalidError);
    });
  });

  describe('setLegs()', () => {
    let service: Service;

    beforeEach(() => {
      service = new ServiceBuilder()
        .withTenantId(TENANT)
        .withResourceRequirements([requirement(ResourceType.STAFF)])
        .withBufferAfterMinutes(30)
        .build();
    });

    it('clears resourceRequirements and bufferAfterMinutes when legs is set (mutual exclusivity)', () => {
      service.setLegs([leg(0), leg(1)], activeIds(ResourceType.ROOM));
      expect(service.resourceRequirements).toEqual([]);
      expect(service.bufferAfterMinutes).toBeNull();
      expect(service.legs).toHaveLength(2);
    });

    it('rejects fewer than 2 legs (UC-052 A1)', () => {
      expect(() => service.setLegs([leg(0)], activeIds(ResourceType.ROOM))).toThrow(
        BookingServiceLegsTooFewError,
      );
    });

    it('rejects a leg referencing a resource type with no active resources', () => {
      expect(() => service.setLegs([leg(0), leg(1)], activeIds())).toThrow(
        BookingServiceResourceTypeUnavailableError,
      );
    });

    it('returns the total span: sum(durations) + sum(gaps except the last leg)', () => {
      const totalSpan = service.setLegs([leg(0), leg(1)], activeIds(ResourceType.ROOM));
      // 20 + 20 (durations) + 5 (leg 0's gap only — the last leg's gap never applies)
      expect(totalSpan).toBe(45);
    });

    it('rejects when the service is a SESSION (mutual exclusivity with classResourceSlots)', () => {
      const sessionService = new ServiceBuilder()
        .withTenantId(TENANT)
        .withBookingModel('SESSION')
        .withResourceRequirements([])
        .withBufferAfterMinutes(null)
        .withClassResourceSlots([])
        .build();
      expect(() => sessionService.setLegs([leg(0), leg(1)], activeIds(ResourceType.ROOM))).toThrow(
        BookingServiceBookingModelMismatchError,
      );
    });

    it('rejects legs repeating the same legIndex', () => {
      expect(() =>
        service.setLegs(
          [leg(0), leg(0, ResourceType.STAFF)],
          activeIds(ResourceType.ROOM, ResourceType.STAFF),
        ),
      ).toThrow(ServiceLegInvalidError);
    });
  });

  describe('setBufferAfterMinutes()', () => {
    it('sets the buffer for a flat/non-legged service', () => {
      const service = new ServiceBuilder().withTenantId(TENANT).build();
      service.setBufferAfterMinutes(15);
      expect(service.bufferAfterMinutes).toBe(15);
    });

    it('rejects when the service has legs (UC-053 A1, since legs use per-leg transition gaps)', () => {
      const service = new ServiceBuilder().withTenantId(TENANT).build();
      service.setLegs([leg(0), leg(1)], activeIds(ResourceType.ROOM));
      expect(() => service.setBufferAfterMinutes(15)).toThrow(BookingServiceHasLegsError);
    });

    it('rejects when the service is a SESSION (mutual exclusivity)', () => {
      const sessionService = new ServiceBuilder()
        .withTenantId(TENANT)
        .withBookingModel('SESSION')
        .withResourceRequirements([])
        .withBufferAfterMinutes(null)
        .withClassResourceSlots([])
        .build();
      expect(() => sessionService.setBufferAfterMinutes(15)).toThrow(
        BookingServiceBookingModelMismatchError,
      );
    });

    it('rejects a negative buffer', () => {
      const service = new ServiceBuilder().withTenantId(TENANT).build();
      expect(() => service.setBufferAfterMinutes(-1)).toThrow(
        ServiceBufferAfterMinutesInvalidError,
      );
    });

    it('allows a buffer of zero', () => {
      const service = new ServiceBuilder().withTenantId(TENANT).build();
      service.setBufferAfterMinutes(0);
      expect(service.bufferAfterMinutes).toBe(0);
    });
  });

  describe('changeBookingModel()', () => {
    it('changes bookingModel when the service has no booking history', () => {
      const service = new ServiceBuilder()
        .withTenantId(TENANT)
        .withBookingModel('APPOINTMENT')
        .build();
      service.changeBookingModel('SESSION', false);
      expect(service.bookingModel).toBe('SESSION');
    });

    it('rejects a bookingModel change once the service has booking history (UC-056 A1)', () => {
      const service = new ServiceBuilder()
        .withTenantId(TENANT)
        .withBookingModel('APPOINTMENT')
        .build();
      expect(() => service.changeBookingModel('SESSION', true)).toThrow(
        BookingServiceBookingModelImmutableError,
      );
    });

    it('allows an unchanged resubmission of the current value even with booking history (compare-before-validate)', () => {
      const service = new ServiceBuilder()
        .withTenantId(TENANT)
        .withBookingModel('APPOINTMENT')
        .build();
      expect(() => service.changeBookingModel('APPOINTMENT', true)).not.toThrow();
      expect(service.bookingModel).toBe('APPOINTMENT');
    });

    it('clears resourceRequirements/legs/bufferAfterMinutes when switching to SESSION (mutual exclusivity)', () => {
      const service = new ServiceBuilder()
        .withTenantId(TENANT)
        .withBookingModel('APPOINTMENT')
        .withResourceRequirements([requirement(ResourceType.STAFF)])
        .withBufferAfterMinutes(30)
        .build();
      service.changeBookingModel('SESSION', false);
      expect(service.resourceRequirements).toEqual([]);
      expect(service.legs).toBeNull();
      expect(service.bufferAfterMinutes).toBeNull();
      expect(service.classResourceSlots).toEqual([]);
    });

    it('clears classResourceSlots when switching to APPOINTMENT (mutual exclusivity)', () => {
      const service = new ServiceBuilder()
        .withTenantId(TENANT)
        .withBookingModel('SESSION')
        .withResourceRequirements([])
        .withBufferAfterMinutes(null)
        .withClassResourceSlots([])
        .build();
      service.changeBookingModel('APPOINTMENT', false);
      expect(service.classResourceSlots).toBeNull();
    });
  });
});
