import { uuidv7 } from '../../../../shared/domain/uuid-v7';
import { ServiceBuilder } from '../../../../test/builders/booking/index';
import { ResourceBuilder } from '../../../../test/builders/booking/resource.builder';
import { InMemoryResourceOccupancyRepository } from '../../../../test/repositories/booking/in-memory-resource-occupancy.repository';
import { InMemoryResourceRepository } from '../../../../test/repositories/booking/in-memory-resource.repository';
import { AvailabilityService } from '../../domain/services/availability.service';
import { ResourceRequirement } from '../../domain/resource-requirement';
import { Resource } from '../../domain/resource.aggregate';
import { ResourceType } from '../../domain/resource.types';
import { Service } from '../../domain/service.aggregate';
import { ServiceLeg } from '../../domain/service-leg';
import { lockCandidateResources } from './resource-candidate-locking.helpers';
import { ResolutionContext } from './resource-resolution-context.helpers';

const TENANT_ID = '10000000-0000-4000-8000-0000000003a1';
const LINE = { lineId: 'line-1', serviceId: 'service-1', durationMinsAtBooking: 30 };

describe('lockCandidateResources', () => {
  let resourceRepo: InMemoryResourceRepository;
  let ctx: ResolutionContext;
  let locked: string[][];

  const lockResources = (resourceIds: string[]): Promise<void> => {
    locked.push(resourceIds);
    return Promise.resolve();
  };

  const seed = async (type: ResourceType): Promise<Resource> => {
    const builder = new ResourceBuilder().withTenantId(TENANT_ID).withType(type);
    const resource = (type === ResourceType.STAFF ? builder.withRefId(uuidv7()) : builder).build();
    await resourceRepo.save(resource);
    return resource;
  };

  const serviceWith = (...requirements: ResourceRequirement[]): Service =>
    new ServiceBuilder()
      .withId('service-1')
      .withDurationMinutes(30)
      .withResourceRequirements(requirements)
      .build();

  const lock = (
    services: Map<string, Service>,
    resourceSelections: { resourceId: string }[] = [],
    lines = [LINE],
  ) =>
    lockCandidateResources({
      lines,
      serviceMap: services,
      resourceSelections: resourceSelections.map(({ resourceId }) => ({
        serviceId: 'service-1',
        legIndex: null,
        resourceType: ResourceType.STAFF,
        resourceId,
      })),
      ctx,
      lockResources,
    });

  beforeEach(() => {
    resourceRepo = new InMemoryResourceRepository();
    locked = [];
    ctx = {
      resourceRepo,
      availabilityService: new AvailabilityService(),
      occupancyRepo: new InMemoryResourceOccupancyRepository(),
      tenantId: TENANT_ID,
      timezone: 'America/Sao_Paulo',
      resourceCache: new Map(),
      activeResourcesByType: new Map(),
      excludeBookingLineIds: [],
    };
  });

  it('locks every eligible unit of an AUTO_FUNGIBLE_POOL requirement in one call', async () => {
    const rooms = [await seed(ResourceType.ROOM), await seed(ResourceType.ROOM)];
    await seed(ResourceType.EQUIPMENT);
    const service = serviceWith(
      ResourceRequirement.create({ type: ResourceType.ROOM, selectionMode: 'AUTO_FUNGIBLE_POOL' }),
    );

    await lock(new Map([['service-1', service]]));

    expect(locked).toHaveLength(1);
    expect([...locked[0]].sort()).toEqual(rooms.map((room) => room.id).sort());
  });

  it('locks only the pool members when the requirement is restricted to a pool', async () => {
    const inPool = await seed(ResourceType.ROOM);
    await seed(ResourceType.ROOM);
    const service = serviceWith(
      ResourceRequirement.create({
        type: ResourceType.ROOM,
        selectionMode: 'AUTO_ANY',
        resourcePoolIds: [inPool.id],
      }),
    );

    await lock(new Map([['service-1', service]]));

    expect(locked).toEqual([[inPool.id]]);
  });

  it('adds the customer-chosen units to the same single call, deduplicated', async () => {
    const room = await seed(ResourceType.ROOM);
    const staff = await seed(ResourceType.STAFF);
    const service = serviceWith(
      ResourceRequirement.create({ type: ResourceType.STAFF, selectionMode: 'CUSTOMER_CHOICE' }),
      ResourceRequirement.create({ type: ResourceType.ROOM, selectionMode: 'AUTO_ANY' }),
    );

    await lock(new Map([['service-1', service]]), [
      { resourceId: staff.id },
      { resourceId: room.id },
    ]);

    expect(locked).toHaveLength(1);
    expect([...locked[0]].sort()).toEqual([room.id, staff.id].sort());
  });

  it('does not lock anything for a booking that only has customer-chosen requirements', async () => {
    const staff = await seed(ResourceType.STAFF);
    const service = serviceWith(
      ResourceRequirement.create({ type: ResourceType.STAFF, selectionMode: 'CUSTOMER_CHOICE' }),
    );

    await lock(new Map([['service-1', service]]), [{ resourceId: staff.id }]);

    expect(locked).toEqual([]);
  });

  it('includes the requirements of every leg of a legged service', async () => {
    const room = await seed(ResourceType.ROOM);
    const equipment = await seed(ResourceType.EQUIPMENT);
    const service = new ServiceBuilder()
      .withId('service-1')
      .withLegs([
        ServiceLeg.create({
          legIndex: 0,
          name: 'Etapa 0',
          durationMinutes: 15,
          resourceRequirements: [
            ResourceRequirement.create({ type: ResourceType.ROOM, selectionMode: 'AUTO_ANY' }),
          ],
          transitionGapAfterMinutes: 0,
        }),
        ServiceLeg.create({
          legIndex: 1,
          name: 'Etapa 1',
          durationMinutes: 15,
          resourceRequirements: [
            ResourceRequirement.create({
              type: ResourceType.EQUIPMENT,
              selectionMode: 'AUTO_FUNGIBLE_POOL',
            }),
          ],
          transitionGapAfterMinutes: 0,
        }),
      ])
      .build();

    await lock(new Map([['service-1', service]]));

    expect(locked).toHaveLength(1);
    expect([...locked[0]].sort()).toEqual([room.id, equipment.id].sort());
  });

  it('locks the tenant LOCATION for a service with nothing configured', async () => {
    const location = await seed(ResourceType.LOCATION);
    const service = serviceWith();

    await lock(new Map([['service-1', service]]));

    expect(locked).toEqual([[location.id]]);
  });

  it('merges the units of several lines into one call', async () => {
    const rooms = [await seed(ResourceType.ROOM), await seed(ResourceType.ROOM)];
    const service = serviceWith(
      ResourceRequirement.create({ type: ResourceType.ROOM, selectionMode: 'AUTO_FUNGIBLE_POOL' }),
    );

    const findByTenant = jest.spyOn(resourceRepo, 'findByTenant');

    await lock(new Map([['service-1', service]]), [], [LINE, { ...LINE, lineId: 'line-2' }]);

    expect(locked).toHaveLength(1);
    expect([...locked[0]].sort()).toEqual(rooms.map((room) => room.id).sort());
    // Two lines of one service load the room type once, not once per line.
    expect(findByTenant).toHaveBeenCalledTimes(1);
  });

  it('leaves an unknown service to the resolution loop and locks nothing', async () => {
    await lock(new Map());

    expect(locked).toEqual([]);
  });

  it("never locks another tenant's resources", async () => {
    const own = await seed(ResourceType.ROOM);
    const foreign = new ResourceBuilder()
      .withTenantId('10000000-0000-4000-8000-0000000003a2')
      .withType(ResourceType.ROOM)
      .build();
    await resourceRepo.save(foreign);
    const service = serviceWith(
      ResourceRequirement.create({ type: ResourceType.ROOM, selectionMode: 'AUTO_ANY' }),
    );

    await lock(new Map([['service-1', service]]));

    expect(locked).toEqual([[own.id]]);
  });
});
