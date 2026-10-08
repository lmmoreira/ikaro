import { InMemoryResourceOccupancyRepository } from '../../../../test/repositories/booking/in-memory-resource-occupancy.repository';
import { ResourceBuilder } from '../../../../test/builders/booking/index';
import { Resource } from '../../domain/resource.aggregate';
import { ResourceType } from '../../domain/resource.types';
import { AvailabilityService } from '../../domain/services/availability.service';
import {
  findCombinedRefusals,
  findOccupiedRefusals,
} from './recurring-occurrence-occupancy.helpers';

const TENANT = '10000000-0000-4000-8000-000000000800';

const OCCURRENCES = [1, 8, 15].map((day) => ({
  occurrenceStart: new Date(Date.UTC(2026, 9, day, 13)),
  occurrenceStartLocalDate: `2026-10-${String(day).padStart(2, '0')}`,
}));

describe('findOccupiedRefusals', () => {
  let occupancyRepo: InMemoryResourceOccupancyRepository;

  const room = (name: string, turnoverMinutes = 0): Resource =>
    new ResourceBuilder()
      .withTenantId(TENANT)
      .withType(ResourceType.ROOM)
      .withName(name)
      .withTurnoverMinutes(turnoverMinutes)
      .build();

  function occupy(resource: Resource, startsAt: Date, minutes = 60): void {
    occupancyRepo.seed(TENANT, `line-${startsAt.getTime()}-${resource.id}`, {
      resourceId: resource.id,
      resourceType: ResourceType.ROOM,
      resourceName: resource.name,
      legIndex: null,
      quantityPosition: null,
      selectionMode: 'CUSTOMER_CHOICE',
      isBundleMember: false,
      gapMinutes: null,
      gapSource: null,
      startsAt,
      endsAt: new Date(startsAt.getTime() + minutes * 60_000),
    });
  }

  function check(
    resources: Resource[],
    options: { anyFreeResourceSuffices?: boolean; bufferAfterMinutes?: number } = {},
  ) {
    return findOccupiedRefusals({
      occupancyRepo,
      availabilityService: new AvailabilityService(),
      tenantId: TENANT,
      occurrences: OCCURRENCES,
      durationMinutes: 60,
      bufferAfterMinutes: options.bufferAfterMinutes ?? 0,
      resources,
      anyFreeResourceSuffices: options.anyFreeResourceSuffices ?? false,
    });
  }

  beforeEach(() => {
    occupancyRepo = new InMemoryResourceOccupancyRepository();
  });

  it('refuses nothing when no occurrence window is taken', async () => {
    const result = await check([room('Sala A')]);

    expect(result.refusals).toEqual([]);
    expect(result.conflictingWindows).toEqual([]);
  });

  it('refuses exactly the occurrences whose window is taken, as OCCUPIED, in one query', async () => {
    const a = room('Sala A');
    occupy(a, OCCURRENCES[1].occurrenceStart);
    const querySpy = jest.spyOn(occupancyRepo, 'findConflictingWindows');

    const result = await check([a]);

    expect(result.refusals).toEqual([
      { occurrenceStart: OCCURRENCES[1].occurrenceStart, reason: 'OCCUPIED' },
    ]);
    expect(querySpy).toHaveBeenCalledTimes(1);
  });

  it('sends one window per occurrence and resource to that single query', async () => {
    const querySpy = jest.spyOn(occupancyRepo, 'findConflictingWindows');

    await check([room('Sala A'), room('Sala B')]);

    expect(querySpy.mock.calls[0][1]).toHaveLength(OCCURRENCES.length * 2);
  });

  it("extends each window by the larger of the service buffer and that resource's turnover", async () => {
    const a = room('Sala A', 30);
    const b = room('Sala B', 0);
    const querySpy = jest.spyOn(occupancyRepo, 'findConflictingWindows');

    await check([a, b], { bufferAfterMinutes: 15 });

    const windows = querySpy.mock.calls[0][1];
    const lengthFor = (resource: Resource) =>
      windows
        .filter((window) => window.resourceId === resource.id)
        .map((window) => (window.endsAt.getTime() - window.startsAt.getTime()) / 60_000);
    // 60 minutes plus max(15, 30) for Sala A, plus max(15, 0) for Sala B.
    expect(lengthFor(a)).toEqual([90, 90, 90]);
    expect(lengthFor(b)).toEqual([75, 75, 75]);
  });

  it("catches an occurrence blocked only by another booking's trailing gap", async () => {
    const a = room('Sala A', 30);
    // Ends 30 minutes after the occurrence window ends (still inside its 30-minute turnover).
    occupy(a, new Date(OCCURRENCES[0].occurrenceStart.getTime() + 75 * 60_000), 30);

    const result = await check([a]);

    expect(result.refusals.map((r) => r.occurrenceStart)).toEqual([OCCURRENCES[0].occurrenceStart]);
  });

  describe('when every considered resource is needed', () => {
    it('refuses an occurrence as soon as any resource is busy', async () => {
      const [a, b] = [room('Sala A'), room('Sala B')];
      occupy(a, OCCURRENCES[2].occurrenceStart);

      const result = await check([a, b], { anyFreeResourceSuffices: false });

      expect(result.refusals.map((r) => r.occurrenceStart)).toEqual([
        OCCURRENCES[2].occurrenceStart,
      ]);
    });
  });

  describe('when one free resource suffices', () => {
    it('refuses an occurrence only when every considered resource is busy', async () => {
      const [a, b] = [room('Sala A'), room('Sala B')];
      occupy(a, OCCURRENCES[0].occurrenceStart);
      occupy(a, OCCURRENCES[1].occurrenceStart);
      occupy(b, OCCURRENCES[1].occurrenceStart);

      const result = await check([a, b], { anyFreeResourceSuffices: true });

      expect(result.refusals.map((r) => r.occurrenceStart)).toEqual([
        OCCURRENCES[1].occurrenceStart,
      ]);
      // The busy windows are still reported in full, for the resource plan to read.
      expect(result.conflictingWindows).toHaveLength(3);
    });
  });

  it("never treats another tenant's occupancy as a conflict", async () => {
    const a = room('Sala A');
    occupancyRepo.seed('other-tenant', 'line-x', {
      resourceId: a.id,
      resourceType: ResourceType.ROOM,
      resourceName: 'Sala A',
      legIndex: null,
      quantityPosition: null,
      selectionMode: 'CUSTOMER_CHOICE',
      isBundleMember: false,
      gapMinutes: null,
      gapSource: null,
      startsAt: OCCURRENCES[0].occurrenceStart,
      endsAt: new Date(OCCURRENCES[0].occurrenceStart.getTime() + 3_600_000),
    });

    const result = await check([a]);

    expect(result.refusals).toEqual([]);
  });
});

describe('findCombinedRefusals', () => {
  const resource = (name: string): Resource =>
    new ResourceBuilder().withTenantId(TENANT).withType(ResourceType.ROOM).withName(name).build();
  const window = (r: Resource, index: number) => ({
    resourceId: r.id,
    startsAt: OCCURRENCES[index].occurrenceStart,
    endsAt: new Date(OCCURRENCES[index].occurrenceStart.getTime() + 3_600_000),
  });

  it('refuses an occurrence where one resource is busy and the other is closed', () => {
    const [closed, busy] = [resource('A'), resource('B')];

    const result = findCombinedRefusals({
      occurrences: OCCURRENCES,
      resources: [closed, busy],
      unavailable: [window(closed, 1), window(busy, 1)],
    });

    expect(result).toEqual([
      { occurrenceStart: OCCURRENCES[1].occurrenceStart, reason: 'OCCUPIED' },
    ]);
  });

  it('refuses nothing while some resource is both open and free', () => {
    const [closed, free] = [resource('A'), resource('B')];

    const result = findCombinedRefusals({
      occurrences: OCCURRENCES,
      resources: [closed, free],
      unavailable: [window(closed, 0), window(closed, 1), window(closed, 2)],
    });

    expect(result).toEqual([]);
  });

  it('does not treat a resource unavailable on a different occurrence as unavailable here', () => {
    const [a, b] = [resource('A'), resource('B')];

    const result = findCombinedRefusals({
      occurrences: OCCURRENCES,
      resources: [a, b],
      unavailable: [window(a, 0), window(b, 1)],
    });

    expect(result).toEqual([]);
  });
});
