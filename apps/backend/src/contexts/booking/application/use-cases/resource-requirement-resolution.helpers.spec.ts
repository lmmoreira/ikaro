import { ResourceBuilder } from '../../../../test/builders/booking/index';
import { InMemoryResourceOccupancyRepository } from '../../../../test/repositories/booking/in-memory-resource-occupancy.repository';
import { InMemoryResourceRepository } from '../../../../test/repositories/booking/in-memory-resource.repository';
import {
  BookingResourceSelectionRequiredError,
  BookingServiceResourceTypeUnavailableError,
} from '../../domain/errors/booking-domain.error';
import { AvailabilityService } from '../../domain/services/availability.service';
import { Resource } from '../../domain/resource.aggregate';
import { ResourceRequirement } from '../../domain/resource-requirement';
import { ResourceType } from '../../domain/resource.types';
import {
  resolveEligibleResources,
  resolveRequirementResources,
} from './resource-requirement-resolution.helpers';
import { ResolutionContext } from './resource-resolution-context.helpers';

const TENANT_A = '10000000-0000-4000-8000-0000000029f2';
const TENANT_B = '10000000-0000-4000-8000-0000000029f3';
const START = new Date('2030-01-07T12:00:00.000Z');
const END = new Date('2030-01-07T13:00:00.000Z');

describe('resource-requirement-resolution.helpers', () => {
  let resourceRepo: InMemoryResourceRepository;

  const seedRoom = async (tenantId = TENANT_A): Promise<Resource> => {
    const room = new ResourceBuilder().withTenantId(tenantId).withType(ResourceType.ROOM).build();
    await resourceRepo.save(room);
    return room;
  };

  const newContext = (): ResolutionContext => ({
    resourceRepo,
    availabilityService: new AvailabilityService(),
    occupancyRepo: new InMemoryResourceOccupancyRepository(),
    tenantId: TENANT_A,
    timezone: 'America/Sao_Paulo',
    resourceCache: new Map(),
    activeResourcesByType: new Map(),
    excludeBookingLineIds: [],
  });

  const requirement = (
    selectionMode: 'CUSTOMER_CHOICE' | 'AUTO_ANY' | 'AUTO_FUNGIBLE_POOL',
    extra: { resourcePoolIds?: string[] | null; requiredQuantity?: number } = {},
  ) => ResourceRequirement.create({ type: ResourceType.ROOM, selectionMode, ...extra });

  beforeEach(() => {
    resourceRepo = new InMemoryResourceRepository();
  });

  describe('resolveEligibleResources()', () => {
    it('returns the active resources of the type, and loads them once per type per context', async () => {
      const room = await seedRoom();
      const inactive = await seedRoom();
      inactive.deactivate();
      await resourceRepo.save(inactive);
      const findByTenant = jest.spyOn(resourceRepo, 'findByTenant');
      const ctx = newContext();

      const first = await resolveEligibleResources(requirement('AUTO_ANY'), ctx);
      const second = await resolveEligibleResources(requirement('AUTO_ANY'), ctx);

      expect(first.map((r) => r.id)).toEqual([room.id]);
      expect(second.map((r) => r.id)).toEqual([room.id]);
      expect(findByTenant).toHaveBeenCalledTimes(1);
    });

    it('restricts to a non-empty pool and treats an empty pool as unrestricted', async () => {
      const inPool = await seedRoom();
      await seedRoom();

      const pooled = await resolveEligibleResources(
        requirement('AUTO_ANY', { resourcePoolIds: [inPool.id] }),
        newContext(),
      );
      const unrestricted = await resolveEligibleResources(
        requirement('AUTO_ANY', { resourcePoolIds: [] }),
        newContext(),
      );

      expect(pooled.map((r) => r.id)).toEqual([inPool.id]);
      expect(unrestricted).toHaveLength(2);
    });

    it('throws when the tenant has no active resource of the type', async () => {
      await expect(
        resolveEligibleResources(requirement('AUTO_ANY'), newContext()),
      ).rejects.toBeInstanceOf(BookingServiceResourceTypeUnavailableError);
    });

    it("never returns another tenant's resources", async () => {
      await seedRoom(TENANT_B);

      await expect(
        resolveEligibleResources(requirement('AUTO_ANY'), newContext()),
      ).rejects.toBeInstanceOf(BookingServiceResourceTypeUnavailableError);
    });
  });

  describe('resolveRequirementResources()', () => {
    const resolve = (req: ResourceRequirement, chosen: string[], ctx = newContext()) =>
      resolveRequirementResources(req, ctx, chosen, START, END);

    it('CUSTOMER_CHOICE resolves the chosen resource', async () => {
      const room = await seedRoom();
      await seedRoom();

      const result = await resolve(requirement('CUSTOMER_CHOICE'), [room.id]);

      expect(result.map((r) => r.id)).toEqual([room.id]);
    });

    it('CUSTOMER_CHOICE without a pick throws BookingResourceSelectionRequiredError', async () => {
      await seedRoom();

      await expect(resolve(requirement('CUSTOMER_CHOICE'), [])).rejects.toBeInstanceOf(
        BookingResourceSelectionRequiredError,
      );
    });

    it('CUSTOMER_CHOICE counts a repeated id once, so it cannot satisfy requiredQuantity 2', async () => {
      const room = await seedRoom();

      await expect(
        resolve(requirement('CUSTOMER_CHOICE', { requiredQuantity: 2 }), [room.id, room.id]),
      ).rejects.toBeInstanceOf(BookingResourceSelectionRequiredError);
    });

    it('CUSTOMER_CHOICE resolves every distinct pick when requiredQuantity > 1', async () => {
      const a = await seedRoom();
      const b = await seedRoom();

      const result = await resolve(requirement('CUSTOMER_CHOICE', { requiredQuantity: 2 }), [
        a.id,
        b.id,
      ]);

      expect(result.map((r) => r.id)).toEqual([a.id, b.id]);
    });

    describe('CUSTOMER_CHOICE rejects with BookingServiceResourceTypeUnavailableError', () => {
      it('an inactive pick', async () => {
        const room = await seedRoom();
        room.deactivate();
        await resourceRepo.save(room);

        await expect(resolve(requirement('CUSTOMER_CHOICE'), [room.id])).rejects.toBeInstanceOf(
          BookingServiceResourceTypeUnavailableError,
        );
      });

      it('a pick of the wrong type', async () => {
        const equipment = new ResourceBuilder()
          .withTenantId(TENANT_A)
          .withType(ResourceType.EQUIPMENT)
          .build();
        await resourceRepo.save(equipment);

        await expect(
          resolve(requirement('CUSTOMER_CHOICE'), [equipment.id]),
        ).rejects.toBeInstanceOf(BookingServiceResourceTypeUnavailableError);
      });

      it('a pick outside the requirement pool — an empty pool never restricts', async () => {
        const inPool = await seedRoom();
        const outside = await seedRoom();

        await expect(
          resolve(requirement('CUSTOMER_CHOICE', { resourcePoolIds: [inPool.id] }), [outside.id]),
        ).rejects.toBeInstanceOf(BookingServiceResourceTypeUnavailableError);
        const unrestricted = await resolve(
          requirement('CUSTOMER_CHOICE', { resourcePoolIds: [] }),
          [outside.id],
        );
        expect(unrestricted.map((r) => r.id)).toEqual([outside.id]);
      });

      it("another tenant's resource", async () => {
        const foreign = await seedRoom(TENANT_B);

        await expect(resolve(requirement('CUSTOMER_CHOICE'), [foreign.id])).rejects.toBeInstanceOf(
          BookingServiceResourceTypeUnavailableError,
        );
      });
    });

    it('AUTO_FUNGIBLE_POOL takes the first requiredQuantity eligible resources', async () => {
      await seedRoom();
      await seedRoom();
      await seedRoom();

      const result = await resolve(requirement('AUTO_FUNGIBLE_POOL', { requiredQuantity: 2 }), []);

      expect(result).toHaveLength(2);
      expect(new Set(result.map((r) => r.id)).size).toBe(2);
    });

    it('throws when fewer eligible resources exist than requiredQuantity', async () => {
      await seedRoom();

      await expect(
        resolve(requirement('AUTO_FUNGIBLE_POOL', { requiredQuantity: 2 }), []),
      ).rejects.toBeInstanceOf(BookingServiceResourceTypeUnavailableError);
    });

    it('AUTO_ANY resolves one eligible resource', async () => {
      await seedRoom();
      await seedRoom();

      const result = await resolve(requirement('AUTO_ANY'), []);

      expect(result).toHaveLength(1);
    });
  });
});
