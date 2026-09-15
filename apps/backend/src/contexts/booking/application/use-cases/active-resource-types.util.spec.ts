import { ResourceBuilder } from '../../../../test/builders/booking/index';
import { InMemoryResourceRepository } from '../../../../test/repositories/booking/in-memory-resource.repository';
import { ResourceType } from '../../domain/resource.types';
import { resolveActiveResourceIdsByType } from './active-resource-types.util';

const TENANT_A = '10000000-0000-4000-8000-000000000001';

describe('resolveActiveResourceIdsByType', () => {
  let resourceRepo: InMemoryResourceRepository;

  beforeEach(() => {
    resourceRepo = new InMemoryResourceRepository();
  });

  it('returns an empty map without querying the repository when given no types', async () => {
    const findByTenantSpy = jest.spyOn(resourceRepo, 'findByTenant');

    const result = await resolveActiveResourceIdsByType(resourceRepo, TENANT_A, []);

    expect(result).toEqual(new Map());
    expect(findByTenantSpy).not.toHaveBeenCalled();
  });

  it('maps a single type to the set of its active resource ids', async () => {
    const room = new ResourceBuilder().withTenantId(TENANT_A).withType(ResourceType.ROOM).build();
    await resourceRepo.save(room);

    const result = await resolveActiveResourceIdsByType(resourceRepo, TENANT_A, [
      ResourceType.ROOM,
    ]);

    expect(result).toEqual(new Map([[ResourceType.ROOM, new Set([room.id])]]));
  });

  it('resolves every distinct type independently, one query each', async () => {
    const room = new ResourceBuilder().withTenantId(TENANT_A).withType(ResourceType.ROOM).build();
    const staff = new ResourceBuilder()
      .withTenantId(TENANT_A)
      .withType(ResourceType.STAFF)
      .withRefId('30000000-0000-4000-8000-000000000001')
      .build();
    await resourceRepo.save(room);
    await resourceRepo.save(staff);
    const findByTenantSpy = jest.spyOn(resourceRepo, 'findByTenant');

    const result = await resolveActiveResourceIdsByType(resourceRepo, TENANT_A, [
      ResourceType.ROOM,
      ResourceType.STAFF,
    ]);

    expect(result).toEqual(
      new Map([
        [ResourceType.ROOM, new Set([room.id])],
        [ResourceType.STAFF, new Set([staff.id])],
      ]),
    );
    expect(findByTenantSpy).toHaveBeenCalledTimes(2);
  });

  it('deduplicates a repeated type into a single query, still keyed once in the result', async () => {
    const room = new ResourceBuilder().withTenantId(TENANT_A).withType(ResourceType.ROOM).build();
    await resourceRepo.save(room);
    const findByTenantSpy = jest.spyOn(resourceRepo, 'findByTenant');

    const result = await resolveActiveResourceIdsByType(resourceRepo, TENANT_A, [
      ResourceType.ROOM,
      ResourceType.ROOM,
    ]);

    expect(result).toEqual(new Map([[ResourceType.ROOM, new Set([room.id])]]));
    expect(findByTenantSpy).toHaveBeenCalledTimes(1);
  });

  it('maps a type with no active resources to an empty set, not an omitted entry', async () => {
    const result = await resolveActiveResourceIdsByType(resourceRepo, TENANT_A, [
      ResourceType.ROOM,
    ]);

    expect(result.has(ResourceType.ROOM)).toBe(true);
    expect(result.get(ResourceType.ROOM)).toEqual(new Set());
  });

  it('only queries with isActive: true, excluding inactive resources from the set', async () => {
    const room = new ResourceBuilder().withTenantId(TENANT_A).withType(ResourceType.ROOM).build();
    room.deactivate();
    await resourceRepo.save(room);

    const result = await resolveActiveResourceIdsByType(resourceRepo, TENANT_A, [
      ResourceType.ROOM,
    ]);

    expect(result.get(ResourceType.ROOM)).toEqual(new Set());
  });

  it("scopes the query to the given tenant, excluding another tenant's resources", async () => {
    const otherTenantRoom = new ResourceBuilder()
      .withTenantId('20000000-0000-4000-8000-000000000002')
      .withType(ResourceType.ROOM)
      .build();
    await resourceRepo.save(otherTenantRoom);

    const result = await resolveActiveResourceIdsByType(resourceRepo, TENANT_A, [
      ResourceType.ROOM,
    ]);

    expect(result.get(ResourceType.ROOM)).toEqual(new Set());
  });
});
