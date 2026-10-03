import { ResourceBuilder } from '../../../../test/builders/booking/index';
import { InMemoryResourceRepository } from '../../../../test/repositories/booking/in-memory-resource.repository';
import { uuidv7 } from '../../../../shared/domain/uuid-v7';
import { AvailabilityService } from '../../domain/services/availability.service';
import { Resource } from '../../domain/resource.aggregate';
import { ResourceRequirement } from '../../domain/resource-requirement';
import { ResourceType } from '../../domain/resource.types';
import {
  createWindowResolutionContext,
  resolveActiveCandidates,
} from './availability-window-candidates.helpers';

const TENANT_A = '10000000-0000-4000-8000-0000000029e1';
const TENANT_B = '10000000-0000-4000-8000-0000000029e2';

const requirement = (type: ResourceType, resourcePoolIds: string[] | null = null) =>
  ResourceRequirement.create({ type, selectionMode: 'AUTO_ANY', resourcePoolIds });

describe('availability-window-candidates.helpers', () => {
  let resourceRepo: InMemoryResourceRepository;

  const seedRoom = async (tenantId = TENANT_A): Promise<Resource> => {
    const room = new ResourceBuilder().withTenantId(tenantId).withType(ResourceType.ROOM).build();
    await resourceRepo.save(room);
    return room;
  };

  const newContext = () =>
    createWindowResolutionContext(resourceRepo, new AvailabilityService(), TENANT_A);

  beforeEach(() => {
    resourceRepo = new InMemoryResourceRepository();
  });

  describe('createWindowResolutionContext()', () => {
    it('starts with empty caches bound to the given repository and tenant', () => {
      const ctx = newContext();

      expect(ctx.tenantId).toBe(TENANT_A);
      expect(ctx.resourceRepo).toBe(resourceRepo);
      expect(ctx.resourceCache.size).toBe(0);
      expect(ctx.candidateCache.size).toBe(0);
    });
  });

  describe('resolveActiveCandidates()', () => {
    it('returns a pinned pick as the whole candidate set without touching the repository', async () => {
      const pinned = await seedRoom();
      const findByTenant = jest.spyOn(resourceRepo, 'findByTenant');
      const findById = jest.spyOn(resourceRepo, 'findById');

      const result = await resolveActiveCandidates(requirement(ResourceType.ROOM), newContext(), [
        pinned,
      ]);

      expect(result).toEqual([pinned]);
      expect(findByTenant).not.toHaveBeenCalled();
      expect(findById).not.toHaveBeenCalled();
    });

    it('loads every active resource of the requirement type for the tenant (no pool)', async () => {
      const room = await seedRoom();
      const inactive = await seedRoom();
      inactive.deactivate();
      await resourceRepo.save(inactive);
      await seedRoom(TENANT_B);
      await resourceRepo.save(
        new ResourceBuilder().withTenantId(TENANT_A).withType(ResourceType.EQUIPMENT).build(),
      );

      const result = await resolveActiveCandidates(
        requirement(ResourceType.ROOM),
        newContext(),
        undefined,
      );

      expect(result.map((r) => r.id)).toEqual([room.id]);
    });

    it('treats an empty pool array as unrestricted', async () => {
      const room = await seedRoom();

      const result = await resolveActiveCandidates(
        requirement(ResourceType.ROOM, []),
        newContext(),
        undefined,
      );

      expect(result.map((r) => r.id)).toEqual([room.id]);
    });

    it('restricts to the pool in pool order and silently drops stale members', async () => {
      const first = await seedRoom();
      const second = await seedRoom();
      const deactivated = await seedRoom();
      deactivated.deactivate();
      await resourceRepo.save(deactivated);
      const wrongType = new ResourceBuilder()
        .withTenantId(TENANT_A)
        .withType(ResourceType.EQUIPMENT)
        .build();
      await resourceRepo.save(wrongType);
      const pool = [second.id, deactivated.id, uuidv7(), wrongType.id, first.id];

      const result = await resolveActiveCandidates(
        requirement(ResourceType.ROOM, pool),
        newContext(),
        undefined,
      );

      expect(result.map((r) => r.id)).toEqual([second.id, first.id]);
    });

    it("never resolves another tenant's resource, even when its id is in the pool", async () => {
      const foreign = await seedRoom(TENANT_B);

      const result = await resolveActiveCandidates(
        requirement(ResourceType.ROOM, [foreign.id]),
        newContext(),
        undefined,
      );

      expect(result).toEqual([]);
    });

    it('loads a requirement candidate set once for repeated and concurrent calls', async () => {
      await seedRoom();
      const findByTenant = jest.spyOn(resourceRepo, 'findByTenant');
      const ctx = newContext();
      const req = requirement(ResourceType.ROOM);

      const [a, b] = await Promise.all([
        resolveActiveCandidates(req, ctx, undefined),
        resolveActiveCandidates(req, ctx, undefined),
      ]);
      const c = await resolveActiveCandidates(req, ctx, undefined);

      expect(findByTenant).toHaveBeenCalledTimes(1);
      expect(a).toBe(b);
      expect(b).toBe(c);
    });

    it('caches separately per type and per pool', async () => {
      const room = await seedRoom();
      await seedRoom();
      const findByTenant = jest.spyOn(resourceRepo, 'findByTenant');
      const ctx = newContext();

      const unpooled = await resolveActiveCandidates(
        requirement(ResourceType.ROOM),
        ctx,
        undefined,
      );
      const pooled = await resolveActiveCandidates(
        requirement(ResourceType.ROOM, [room.id]),
        ctx,
        undefined,
      );
      const equipment = await resolveActiveCandidates(
        requirement(ResourceType.EQUIPMENT),
        ctx,
        undefined,
      );

      expect(unpooled).toHaveLength(2);
      expect(pooled.map((r) => r.id)).toEqual([room.id]);
      expect(equipment).toEqual([]);
      expect(findByTenant).toHaveBeenCalledTimes(2);
    });

    it('reuses resource rows already loaded by an unpooled lookup for a later pooled lookup', async () => {
      const room = await seedRoom();
      const ctx = newContext();
      await resolveActiveCandidates(requirement(ResourceType.ROOM), ctx, undefined);
      const findById = jest.spyOn(resourceRepo, 'findById');

      const pooled = await resolveActiveCandidates(
        requirement(ResourceType.ROOM, [room.id]),
        ctx,
        undefined,
      );

      expect(pooled.map((r) => r.id)).toEqual([room.id]);
      expect(findById).not.toHaveBeenCalled();
    });

    it('fetches each distinct pool member once even across requirements that share it', async () => {
      const room = await seedRoom();
      const other = await seedRoom();
      const findById = jest.spyOn(resourceRepo, 'findById');
      const ctx = newContext();

      await resolveActiveCandidates(
        requirement(ResourceType.ROOM, [room.id, other.id]),
        ctx,
        undefined,
      );
      await resolveActiveCandidates(requirement(ResourceType.ROOM, [room.id]), ctx, undefined);

      expect(findById).toHaveBeenCalledTimes(2);
    });
  });
});
