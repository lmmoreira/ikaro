import { ResourceBuilder, ServiceBuilder } from '../../../../test/builders/booking/index';
import { InMemoryResourceRepository } from '../../../../test/repositories/booking/in-memory-resource.repository';
import { TenantSettings } from '../../../platform/domain/value-objects/tenant-settings.vo';
import { nextWeekday } from '../../../../test/utils/date-helpers';
import { AvailabilityService } from '../../domain/services/availability.service';
import { ResourceOccupiedSlot } from '../../domain/resource-occupied-slot';
import { ResourceRequirement } from '../../domain/resource-requirement';
import { ResourceType } from '../../domain/resource.types';
import { toPlainAvailabilityLines } from './availability-lines.helpers';
import { createWindowResolutionContext } from './availability-window-candidates.helpers';
import {
  calculateResourceScopedAvailability,
  ResourceScopedReadDeps,
} from './resource-scoped-availability.helpers';

const TENANT_ID = '10000000-0000-4000-8000-0000000029f1';
const MONDAY = nextWeekday(1);

describe('calculateResourceScopedAvailability', () => {
  const availabilityService = new AvailabilityService();
  const settings = TenantSettings.default();
  let resourceRepo: InMemoryResourceRepository;

  const request = {
    tenantId: TENANT_ID,
    date: MONDAY,
    businessHours: settings.businessHours,
    slotGranularityMinutes: 60 as const,
    serviceBufferMinutes: 0,
  };

  const depsWith = (
    occupancyByResource: Map<string, ResourceOccupiedSlot[]> = new Map(),
    extra: Partial<ResourceScopedReadDeps> = {},
  ): ResourceScopedReadDeps => ({
    resourceRepo,
    availabilityService,
    loadScheduleContext: () =>
      Promise.resolve({ resource: null, closures: [], tenantOpening: null, resourceOpening: null }),
    loadOccupancy: (resourceId) => Promise.resolve(occupancyByResource.get(resourceId) ?? []),
    ...extra,
  });

  const roomService = (durationMinutes = 60) =>
    new ServiceBuilder()
      .withTenantId(TENANT_ID)
      .withDurationMinutes(durationMinutes)
      .withBufferAfterMinutes(0)
      .withResourceRequirements([
        ResourceRequirement.create({ type: ResourceType.ROOM, selectionMode: 'AUTO_ANY' }),
      ])
      .build();

  beforeEach(() => {
    resourceRepo = new InMemoryResourceRepository();
  });

  it('returns no slots when the business-hours pre-filter leaves nothing', async () => {
    const service = roomService(60 * 24);

    const result = await calculateResourceScopedAvailability(
      depsWith(),
      request,
      toPlainAvailabilityLines([service]),
    );

    expect(result).toEqual([]);
  });

  it('returns the free slots in chronological order, dropping only the conflicting one', async () => {
    const room = new ResourceBuilder().withTenantId(TENANT_ID).withType(ResourceType.ROOM).build();
    await resourceRepo.save(room);
    const lines = toPlainAvailabilityLines([roomService()]);
    const all = await calculateResourceScopedAvailability(depsWith(), request, lines);
    const blocked = all[2];
    const occupancy = new Map<string, ResourceOccupiedSlot[]>([
      [
        room.id,
        [
          {
            resourceId: room.id,
            startsAt: new Date(blocked.startsAt),
            endsAt: new Date(blocked.endsAt),
          },
        ],
      ],
    ]);

    const result = await calculateResourceScopedAvailability(depsWith(occupancy), request, lines);

    expect(result.map((slot) => slot.startsAt)).toEqual(
      all.filter((slot) => slot.startsAt !== blocked.startsAt).map((slot) => slot.startsAt),
    );
    const times = result.map((slot) => new Date(slot.startsAt).getTime());
    expect(times).toEqual([...times].sort((a, b) => a - b));
  });

  it('loads each resource schedule and occupancy once for the whole day, however many slots', async () => {
    const room = new ResourceBuilder().withTenantId(TENANT_ID).withType(ResourceType.ROOM).build();
    await resourceRepo.save(room);
    const loadOccupancy = jest.fn().mockResolvedValue([]);
    const deps = depsWith(new Map(), { loadOccupancy });

    const result = await calculateResourceScopedAvailability(
      deps,
      request,
      toPlainAvailabilityLines([roomService()]),
    );

    expect(result.length).toBeGreaterThan(1);
    expect(loadOccupancy).toHaveBeenCalledTimes(1);
  });

  it('uses a shared window context when given one, so a second day does not reload candidates', async () => {
    await resourceRepo.save(
      new ResourceBuilder().withTenantId(TENANT_ID).withType(ResourceType.ROOM).build(),
    );
    const findByTenant = jest.spyOn(resourceRepo, 'findByTenant');
    const windowContext = createWindowResolutionContext(
      resourceRepo,
      availabilityService,
      TENANT_ID,
    );
    const lines = toPlainAvailabilityLines([roomService()]);

    await calculateResourceScopedAvailability(
      depsWith(new Map(), { windowContext }),
      request,
      lines,
    );
    await calculateResourceScopedAvailability(
      depsWith(new Map(), { windowContext }),
      request,
      lines,
    );

    expect(findByTenant).toHaveBeenCalledTimes(1);
  });

  it('creates its own window context when none is given, loading candidates once for the call', async () => {
    await resourceRepo.save(
      new ResourceBuilder().withTenantId(TENANT_ID).withType(ResourceType.ROOM).build(),
    );
    const findByTenant = jest.spyOn(resourceRepo, 'findByTenant');

    await calculateResourceScopedAvailability(
      depsWith(),
      request,
      toPlainAvailabilityLines([roomService()]),
    );

    expect(findByTenant).toHaveBeenCalledTimes(1);
  });
});
