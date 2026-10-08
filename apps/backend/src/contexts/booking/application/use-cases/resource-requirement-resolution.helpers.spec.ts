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

  // Seeds one existing occupancy row for a resource, bypassing assign().
  const seedOccupancy = (
    repo: InMemoryResourceOccupancyRepository,
    resource: Resource,
    options: {
      tenantId?: string;
      startsAt?: Date;
      endsAt?: Date;
      selectionMode?: 'AUTO_ANY' | 'AUTO_FUNGIBLE_POOL';
    } = {},
  ): void => {
    repo.seed(options.tenantId ?? TENANT_A, `line-${options.tenantId ?? TENANT_A}-${resource.id}`, {
      resourceId: resource.id,
      startsAt: options.startsAt ?? START,
      endsAt: options.endsAt ?? END,
      resourceType: ResourceType.ROOM,
      resourceName: resource.name,
      legIndex: null,
      quantityPosition: null,
      gapMinutes: null,
      gapSource: null,
      selectionMode: options.selectionMode ?? 'AUTO_FUNGIBLE_POOL',
      isBundleMember: false,
    });
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
    selectionMode: 'CUSTOMER_CHOICE' | 'AUTO_ANY' | 'AUTO_FUNGIBLE_POOL' | 'NONE',
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

    describe('AUTO_FUNGIBLE_POOL narrows to units free for the window (M23-S32, UC-062)', () => {
      const occupy = (resource: Resource, startsAt = START, endsAt = END): void =>
        seedOccupancy(occupancyRepo, resource, { startsAt, endsAt });
      const sortedIds = (rooms: Resource[]): string[] => rooms.map((r) => r.id).sort();

      let occupancyRepo: InMemoryResourceOccupancyRepository;
      let ctx: ResolutionContext;

      beforeEach(() => {
        occupancyRepo = new InMemoryResourceOccupancyRepository();
        ctx = { ...newContext(), occupancyRepo };
      });

      it('picks a free unit when the first one is busy', async () => {
        const rooms = [await seedRoom(), await seedRoom()];
        const [first, second] = sortedIds(rooms);
        occupy(rooms.find((r) => r.id === first) as Resource);

        const result = await resolve(requirement('AUTO_FUNGIBLE_POOL'), [], ctx);

        expect(result.map((r) => r.id)).toEqual([second]);
      });

      it('takes the free units in resourceId order, whatever order they were loaded in', async () => {
        const rooms = [await seedRoom(), await seedRoom(), await seedRoom()];

        const result = await resolve(
          requirement('AUTO_FUNGIBLE_POOL', { requiredQuantity: 2 }),
          [],
          ctx,
        );

        expect(result.map((r) => r.id)).toEqual(sortedIds(rooms).slice(0, 2));
      });

      it('skips a unit busy only inside its own trailing gap', async () => {
        const rooms = [await seedRoom(), await seedRoom()];
        const [first, second] = sortedIds(rooms);
        // Busy right after the requested window ends; free against the raw window alone.
        occupy(
          rooms.find((r) => r.id === first) as Resource,
          END,
          new Date(END.getTime() + 30 * 60_000),
        );

        const result = await resolveRequirementResources(
          requirement('AUTO_FUNGIBLE_POOL'),
          ctx,
          [],
          START,
          END,
          () => 15,
        );

        expect(result.map((r) => r.id)).toEqual([second]);
      });

      it('falls back to the full list when every unit is busy, so assertSlotFree still reports the 409', async () => {
        const rooms = [await seedRoom(), await seedRoom()];
        rooms.forEach((room) => occupy(room));

        const result = await resolve(requirement('AUTO_FUNGIBLE_POOL'), [], ctx);

        expect(result.map((r) => r.id)).toEqual(sortedIds(rooms).slice(0, 1));
      });

      it('falls back to the full list when fewer units are free than requiredQuantity', async () => {
        const rooms = [await seedRoom(), await seedRoom(), await seedRoom()];
        const [busyA, busyB] = sortedIds(rooms);
        occupy(rooms.find((r) => r.id === busyA) as Resource);
        occupy(rooms.find((r) => r.id === busyB) as Resource);

        // Resolves to the full list (not a short one that would fail as "type unavailable"), so the
        // booking proceeds to assertSlotFree, which rejects the busy units with the 409.
        const result = await resolve(
          requirement('AUTO_FUNGIBLE_POOL', { requiredQuantity: 2 }),
          [],
          ctx,
        );

        expect(result.map((r) => r.id)).toEqual(sortedIds(rooms).slice(0, 2));
      });

      it("does not count another tenant's occupancy of the same resource id as busy", async () => {
        const rooms = [await seedRoom(), await seedRoom()];
        const [first] = sortedIds(rooms);
        seedOccupancy(occupancyRepo, rooms.find((r) => r.id === first) as Resource, {
          tenantId: TENANT_B,
        });

        const result = await resolve(requirement('AUTO_FUNGIBLE_POOL'), [], ctx);

        expect(result.map((r) => r.id)).toEqual([first]);
      });
    });

    it('NONE keeps the first eligible resource without looking at occupancy', async () => {
      const findConflicting = jest.spyOn(
        InMemoryResourceOccupancyRepository.prototype,
        'findConflictingResourceIds',
      );
      await seedRoom();
      await seedRoom();

      const result = await resolve(requirement('NONE'), []);

      expect(result).toHaveLength(1);
      expect(findConflicting).not.toHaveBeenCalled();
      findConflicting.mockRestore();
    });

    it('AUTO_ANY with requiredQuantity 1 still prefers the free resource', async () => {
      const busy = await seedRoom();
      const free = await seedRoom();
      const ctx = newContext();
      seedOccupancy(ctx.occupancyRepo as InMemoryResourceOccupancyRepository, busy, {
        selectionMode: 'AUTO_ANY',
      });

      const result = await resolve(requirement('AUTO_ANY'), [], ctx);

      expect(result.map((r) => r.id)).toEqual([free.id]);
    });

    it('AUTO_ANY resolves one eligible resource', async () => {
      await seedRoom();
      await seedRoom();

      const result = await resolve(requirement('AUTO_ANY'), []);

      expect(result).toHaveLength(1);
    });
  });
});
