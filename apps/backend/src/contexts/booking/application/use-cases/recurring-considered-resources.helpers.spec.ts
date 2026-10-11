import { uuidv7 } from '../../../../shared/domain/uuid-v7';
import { InMemoryTenantLock } from '../../../../test/infrastructure/in-memory-tenant-lock';
import { ResourceBuilder, ServiceBuilder } from '../../../../test/builders/booking/index';
import { InMemoryResourceOccupancyRepository } from '../../../../test/repositories/booking/in-memory-resource-occupancy.repository';
import { InMemoryResourceRepository } from '../../../../test/repositories/booking/in-memory-resource.repository';
import {
  BookingResourceSelectionRequiredError,
  BookingServiceResourceTypeUnavailableError,
} from '../../domain/errors/booking-domain.error';
import { ResourceRequirement } from '../../domain/resource-requirement';
import { Resource } from '../../domain/resource.aggregate';
import { ResourceType } from '../../domain/resource.types';
import { AvailabilityService } from '../../domain/services/availability.service';
import { Service } from '../../domain/service.aggregate';
import {
  lockConsideredResources,
  resolveConsideredRequirements,
} from './recurring-considered-resources.helpers';

const TENANT = '10000000-0000-4000-8000-000000000420';
const TIMEZONE = 'America/Sao_Paulo';
const FIRST = new Date('2031-03-04T13:00:00.000Z');

describe('resolveConsideredRequirements / lockConsideredResources', () => {
  let resourceRepo: InMemoryResourceRepository;
  let occupancyRepo: InMemoryResourceOccupancyRepository;

  beforeEach(() => {
    resourceRepo = new InMemoryResourceRepository();
    occupancyRepo = new InMemoryResourceOccupancyRepository();
  });

  async function seed(type: ResourceType, count = 1, active = true): Promise<Resource[]> {
    const resources: Resource[] = [];
    for (let i = 0; i < count; i++) {
      const resource = new ResourceBuilder()
        .withTenantId(TENANT)
        .withType(type)
        .withName(`${type} ${i}`)
        .withRefId(type === ResourceType.STAFF ? uuidv7() : null)
        .build();
      if (!active) resource.deactivate();
      await resourceRepo.save(resource);
      resources.push(resource);
    }
    return resources;
  }

  const requirement = (
    type: ResourceType,
    selectionMode: 'CUSTOMER_CHOICE' | 'AUTO_ANY' | 'AUTO_FUNGIBLE_POOL' | 'NONE',
  ) => ResourceRequirement.create({ type, selectionMode });

  const service = (requirements: ResourceRequirement[]): Service =>
    new ServiceBuilder().withTenantId(TENANT).withResourceRequirements(requirements).build();

  const resolve = (
    svc: Service,
    selections: { resourceType: ResourceType; resourceId: string }[],
  ) =>
    resolveConsideredRequirements(
      { resourceRepo, availabilityService: new AvailabilityService(), occupancyRepo },
      {
        tenantId: TENANT,
        timezone: TIMEZONE,
        service: svc,
        selections,
        firstOccurrenceStart: FIRST,
      },
    );

  it('considers only the pick for a customer-chosen requirement and every active resource for an automatic one', async () => {
    const [anna, bia] = await seed(ResourceType.STAFF, 2);
    const rooms = await seed(ResourceType.ROOM, 3);
    await seed(ResourceType.ROOM, 1, false);

    const considered = await resolve(
      service([
        requirement(ResourceType.STAFF, 'CUSTOMER_CHOICE'),
        requirement(ResourceType.ROOM, 'AUTO_ANY'),
      ]),
      [{ resourceType: ResourceType.STAFF, resourceId: bia.id }],
    );

    expect(considered.map((group) => group.anyFreeResourceSuffices)).toEqual([false, true]);
    expect(considered[0].resources.map((r) => r.id)).toEqual([bia.id]);
    expect(considered[0].resources.map((r) => r.id)).not.toContain(anna.id);
    expect(considered[1].resources.map((r) => r.id).sort()).toEqual(rooms.map((r) => r.id).sort());
  });

  it('never offers a resource picked for a customer-chosen requirement to an automatic one', async () => {
    const [chosen, other] = await seed(ResourceType.ROOM, 2);

    const considered = await resolve(
      service([
        requirement(ResourceType.ROOM, 'AUTO_ANY'),
        requirement(ResourceType.ROOM, 'CUSTOMER_CHOICE'),
      ]),
      [{ resourceType: ResourceType.ROOM, resourceId: chosen.id }],
    );

    expect(considered[0].resources.map((r) => r.id)).toEqual([other.id]);
    expect(considered[1].resources.map((r) => r.id)).toEqual([chosen.id]);
  });

  it('fails as unavailable when the picks leave an automatic requirement nothing', async () => {
    const [chosen] = await seed(ResourceType.ROOM);

    await expect(
      resolve(
        service([
          requirement(ResourceType.ROOM, 'AUTO_ANY'),
          requirement(ResourceType.ROOM, 'CUSTOMER_CHOICE'),
        ]),
        [{ resourceType: ResourceType.ROOM, resourceId: chosen.id }],
      ),
    ).rejects.toThrow(BookingServiceResourceTypeUnavailableError);
  });

  it('resolves a service with no requirement against the tenant location', async () => {
    const [location] = await seed(ResourceType.LOCATION);

    const considered = await resolve(service([]), []);

    expect(considered).toHaveLength(1);
    expect(considered[0].resources.map((r) => r.id)).toEqual([location.id]);
    expect(considered[0].anyFreeResourceSuffices).toBe(true);
  });

  it('fails as unavailable when an automatic requirement has no active resource', async () => {
    await expect(
      resolve(service([requirement(ResourceType.ROOM, 'AUTO_ANY')]), []),
    ).rejects.toThrow(BookingServiceResourceTypeUnavailableError);
  });

  it('fails when a customer-chosen requirement has no pick', async () => {
    await seed(ResourceType.STAFF);

    await expect(
      resolve(service([requirement(ResourceType.STAFF, 'CUSTOMER_CHOICE')]), []),
    ).rejects.toThrow(BookingResourceSelectionRequiredError);
  });

  it('locks the union of every requirement’s resources once, each resource once', async () => {
    const [anna] = await seed(ResourceType.STAFF);
    const rooms = await seed(ResourceType.ROOM, 2);
    const considered = await resolve(
      service([
        requirement(ResourceType.STAFF, 'CUSTOMER_CHOICE'),
        requirement(ResourceType.ROOM, 'AUTO_ANY'),
        requirement(ResourceType.ROOM, 'AUTO_ANY'),
      ]),
      [{ resourceType: ResourceType.STAFF, resourceId: anna.id }],
    );
    const tenantLock = new InMemoryTenantLock();
    const lockSpy = jest.spyOn(tenantLock, 'lockResources');

    await lockConsideredResources(tenantLock, TENANT, considered);

    expect(lockSpy).toHaveBeenCalledTimes(1);
    expect(lockSpy.mock.calls[0][0]).toBe(TENANT);
    expect([...lockSpy.mock.calls[0][1]].sort()).toEqual(
      [anna.id, ...rooms.map((r) => r.id)].sort(),
    );
  });
});
