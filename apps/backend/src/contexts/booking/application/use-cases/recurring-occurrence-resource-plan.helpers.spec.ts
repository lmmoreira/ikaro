import { InMemoryResourceOccupancyRepository } from '../../../../test/repositories/booking/in-memory-resource-occupancy.repository';
import { ResourceBuilder } from '../../../../test/builders/booking/index';
import { ResourceType } from '../../domain/resource.types';
import { Resource } from '../../domain/resource.aggregate';
import { ResourceOccupancyWindow } from '../ports/resource-occupancy-repository.port';
import { planOccurrenceResources } from './recurring-occurrence-resource-plan.helpers';

const TENANT = '10000000-0000-4000-8000-000000000600';
const TIMEZONE = 'America/Sao_Paulo';

// Tuesdays at 13:00 UTC (10:00 São Paulo), three weeks running.
const OCCURRENCES = [1, 8, 15].map((day) => ({
  occurrenceStart: new Date(Date.UTC(2026, 9, day, 13)),
  occurrenceStartLocalDate: `2026-10-${String(day).padStart(2, '0')}`,
}));

describe('planOccurrenceResources', () => {
  let occupancyRepo: InMemoryResourceOccupancyRepository;
  let resources: Resource[];

  const resource = (name: string) =>
    new ResourceBuilder().withTenantId(TENANT).withType(ResourceType.ROOM).withName(name).build();

  // The resource with the smaller id sorts first on a tie — order them so "a" < "b" < "c".
  function orderedResources(count: number): Resource[] {
    return Array.from({ length: count }, (_, i) => resource(`Sala ${i}`)).sort((a, b) =>
      a.id.localeCompare(b.id),
    );
  }

  function occupy(resourceId: string, startsAt: Date, hours = 1): void {
    occupancyRepo.seed(TENANT, `line-${Math.random()}`, {
      resourceId,
      resourceType: ResourceType.ROOM,
      resourceName: 'Sala',
      legIndex: null,
      quantityPosition: null,
      selectionMode: 'AUTO_ANY',
      isBundleMember: false,
      startsAt,
      endsAt: new Date(startsAt.getTime() + hours * 3_600_000),
    });
  }

  const busyWindow = (resourceId: string, startsAt: Date): ResourceOccupancyWindow => ({
    resourceId,
    startsAt,
    endsAt: new Date(startsAt.getTime() + 3_600_000),
  });

  function plan(
    selectionMode: 'CUSTOMER_CHOICE' | 'AUTO_ANY' | 'AUTO_FUNGIBLE_POOL',
    unavailableWindows: ResourceOccupancyWindow[] = [],
  ) {
    return planOccurrenceResources(occupancyRepo, {
      tenantId: TENANT,
      timezone: TIMEZONE,
      selectionMode,
      resources,
      occurrences: OCCURRENCES,
      unavailableWindows,
    });
  }

  beforeEach(() => {
    occupancyRepo = new InMemoryResourceOccupancyRepository();
  });

  it('assigns the chosen resource to every occurrence for CUSTOMER_CHOICE, without any query', async () => {
    resources = orderedResources(1);
    const windowsSpy = jest.spyOn(occupancyRepo, 'findActiveWindows');

    const result = await plan('CUSTOMER_CHOICE');

    expect(result.map((r) => r.id)).toEqual(Array(3).fill(resources[0].id));
    expect(windowsSpy).not.toHaveBeenCalled();
  });

  it('assigns the first eligible resource to every occurrence for AUTO_FUNGIBLE_POOL', async () => {
    resources = orderedResources(1);

    const result = await plan('AUTO_FUNGIBLE_POOL');

    expect(result.map((r) => r.id)).toEqual(Array(3).fill(resources[0].id));
  });

  it('plans AUTO_ANY with a single eligible resource without querying the load', async () => {
    resources = orderedResources(1);
    const windowsSpy = jest.spyOn(occupancyRepo, 'findActiveWindows');

    const result = await plan('AUTO_ANY');

    expect(result).toHaveLength(3);
    expect(windowsSpy).not.toHaveBeenCalled();
  });

  describe('AUTO_ANY', () => {
    beforeEach(() => {
      resources = orderedResources(3);
    });

    it('breaks a tie on load by resource id', async () => {
      const result = await plan('AUTO_ANY');

      expect(result.map((r) => r.id)).toEqual(Array(3).fill(resources[0].id));
    });

    it('prefers the resource with the least load on the occurrence own day', async () => {
      // On the first occurrence day, resources[0] and resources[1] already have bookings.
      occupy(resources[0].id, new Date(Date.UTC(2026, 9, 1, 17)));
      occupy(resources[1].id, new Date(Date.UTC(2026, 9, 1, 15)));
      occupy(resources[1].id, new Date(Date.UTC(2026, 9, 1, 18)));

      const result = await plan('AUTO_ANY');

      expect(result[0].id).toBe(resources[2].id);
      expect(result[1].id).toBe(resources[0].id);
      expect(result[2].id).toBe(resources[0].id);
    });

    it('never picks a resource that is busy at the occurrence window', async () => {
      const busy = [busyWindow(resources[0].id, OCCURRENCES[1].occurrenceStart)];

      const result = await plan('AUTO_ANY', busy);

      expect(result[0].id).toBe(resources[0].id);
      expect(result[1].id).toBe(resources[1].id);
      expect(result[2].id).toBe(resources[0].id);
    });

    it('counts a load on another day as no load', async () => {
      occupy(resources[0].id, new Date(Date.UTC(2026, 9, 4, 15)));

      const result = await plan('AUTO_ANY');

      expect(result[0].id).toBe(resources[0].id);
    });

    it('does not count a REQUESTED row or another tenant as load', async () => {
      occupancyRepo.seed('other-tenant', 'line-x', {
        resourceId: resources[0].id,
        resourceType: ResourceType.ROOM,
        resourceName: 'Sala',
        legIndex: null,
        quantityPosition: null,
        selectionMode: 'AUTO_ANY',
        isBundleMember: false,
        startsAt: new Date(Date.UTC(2026, 9, 1, 15)),
        endsAt: new Date(Date.UTC(2026, 9, 1, 16)),
      });

      const result = await plan('AUTO_ANY');

      expect(result[0].id).toBe(resources[0].id);
    });

    it('falls back to every resource when all look busy, leaving the insert to report it', async () => {
      const busy = resources.map((r) => busyWindow(r.id, OCCURRENCES[0].occurrenceStart));

      const result = await plan('AUTO_ANY', busy);

      expect(result[0].id).toBe(resources[0].id);
    });

    it('loads the day windows of the whole term with a single query', async () => {
      const windowsSpy = jest.spyOn(occupancyRepo, 'findActiveWindows');

      await plan('AUTO_ANY');

      expect(windowsSpy).toHaveBeenCalledTimes(1);
    });
  });
});
