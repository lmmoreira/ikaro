import { ServiceBuilder } from '../../../../test/builders/booking/index';
import { ResourceBuilder } from '../../../../test/builders/booking/resource.builder';
import { InMemoryResourceRepository } from '../../../../test/repositories/booking/in-memory-resource.repository';
import type { BusinessHours } from '../../../../shared/value-objects/business-hours.vo';
import { AvailabilityService } from '../../domain/services/availability.service';
import { ResourceRequirement } from '../../domain/resource-requirement';
import { ResourceType } from '../../domain/resource.types';
import { ServiceLeg } from '../../domain/service-leg';
import {
  isBookingWindowAvailable,
  resolveAvailabilityRequirementWindows,
  ResourceAvailabilityContext,
} from './availability-window-resolution.helpers';

const TENANT_ID = '00000000-0000-7000-8000-000000000001';
const CANDIDATE_START = new Date('2026-06-01T10:00:00.000Z');
const OPEN_ALL_DAY_UTC: BusinessHours = {
  timezone: 'UTC',
  monday: { open: '00:00', close: '23:59' },
  tuesday: null,
  wednesday: null,
  thursday: null,
  friday: null,
  saturday: null,
  sunday: null,
};

describe('resolveAvailabilityRequirementWindows', () => {
  let resourceRepo: InMemoryResourceRepository;
  let availabilityService: AvailabilityService;

  beforeEach(() => {
    resourceRepo = new InMemoryResourceRepository();
    availabilityService = new AvailabilityService();
  });

  it('resolves candidateResourceIds from resourcePoolIds, restricted to the active subset', async () => {
    const active = new ResourceBuilder()
      .withTenantId(TENANT_ID)
      .withType(ResourceType.ROOM)
      .build();
    await resourceRepo.save(active);
    const inactive = new ResourceBuilder()
      .withTenantId(TENANT_ID)
      .withType(ResourceType.ROOM)
      .build();
    inactive.deactivate();
    await resourceRepo.save(inactive);
    const service = new ServiceBuilder()
      .withDurationMinutes(30)
      .withResourceRequirements([
        ResourceRequirement.create({
          type: ResourceType.ROOM,
          selectionMode: 'CUSTOMER_CHOICE',
          resourcePoolIds: [active.id, inactive.id],
        }),
      ])
      .build();

    const entries = await resolveAvailabilityRequirementWindows(
      resourceRepo,
      availabilityService,
      TENANT_ID,
      CANDIDATE_START,
      [service],
    );

    expect(entries).toHaveLength(1);
    expect(entries[0].map((c) => c.resourceId)).toEqual([active.id]);
  });

  it('excludes a resourcePoolIds member whose type has since changed away from the requirement', async () => {
    const matching = new ResourceBuilder()
      .withTenantId(TENANT_ID)
      .withType(ResourceType.ROOM)
      .build();
    await resourceRepo.save(matching);
    const retyped = new ResourceBuilder()
      .withTenantId(TENANT_ID)
      .withType(ResourceType.EQUIPMENT)
      .build();
    await resourceRepo.save(retyped);
    const service = new ServiceBuilder()
      .withDurationMinutes(30)
      .withResourceRequirements([
        ResourceRequirement.create({
          type: ResourceType.ROOM,
          selectionMode: 'CUSTOMER_CHOICE',
          resourcePoolIds: [matching.id, retyped.id],
        }),
      ])
      .build();

    const entries = await resolveAvailabilityRequirementWindows(
      resourceRepo,
      availabilityService,
      TENANT_ID,
      CANDIDATE_START,
      [service],
    );

    expect(entries).toHaveLength(1);
    expect(entries[0].map((c) => c.resourceId)).toEqual([matching.id]);
  });

  it("carries a fungible requirement's requiredQuantity onto every one of its candidates", async () => {
    const roomA = new ResourceBuilder().withTenantId(TENANT_ID).withType(ResourceType.ROOM).build();
    await resourceRepo.save(roomA);
    const roomB = new ResourceBuilder().withTenantId(TENANT_ID).withType(ResourceType.ROOM).build();
    await resourceRepo.save(roomB);
    const service = new ServiceBuilder()
      .withDurationMinutes(30)
      .withResourceRequirements([
        ResourceRequirement.create({
          type: ResourceType.ROOM,
          selectionMode: 'AUTO_FUNGIBLE_POOL',
          requiredQuantity: 2,
        }),
      ])
      .build();

    const entries = await resolveAvailabilityRequirementWindows(
      resourceRepo,
      availabilityService,
      TENANT_ID,
      CANDIDATE_START,
      [service],
    );

    expect(entries[0]).toHaveLength(2);
    expect(entries[0].every((c) => c.requiredQuantity === 2)).toBe(true);
  });

  it('falls back to every active resource of the type when resourcePoolIds is unset', async () => {
    const room = new ResourceBuilder().withTenantId(TENANT_ID).withType(ResourceType.ROOM).build();
    await resourceRepo.save(room);
    const service = new ServiceBuilder()
      .withDurationMinutes(30)
      .withBufferAfterMinutes(0)
      .withResourceRequirements([
        ResourceRequirement.create({ type: ResourceType.ROOM, selectionMode: 'AUTO_ANY' }),
      ])
      .build();

    const entries = await resolveAvailabilityRequirementWindows(
      resourceRepo,
      availabilityService,
      TENANT_ID,
      CANDIDATE_START,
      [service],
    );

    expect(entries[0]).toEqual([
      {
        resourceId: room.id,
        startsAt: CANDIDATE_START,
        endsAt: new Date('2026-06-01T10:30:00.000Z'),
        requiredQuantity: 1,
      },
    ]);
  });

  it('resolves to an empty candidate list when no active resource of the type exists', async () => {
    const service = new ServiceBuilder()
      .withResourceRequirements([
        ResourceRequirement.create({ type: ResourceType.EQUIPMENT, selectionMode: 'AUTO_ANY' }),
      ])
      .build();

    const entries = await resolveAvailabilityRequirementWindows(
      resourceRepo,
      availabilityService,
      TENANT_ID,
      CANDIDATE_START,
      [service],
    );

    expect(entries).toEqual([[]]);
  });

  it('sequences multiple services back-to-back with a cursor, each with its own window', async () => {
    const room = new ResourceBuilder().withTenantId(TENANT_ID).withType(ResourceType.ROOM).build();
    await resourceRepo.save(room);
    const equipment = new ResourceBuilder()
      .withTenantId(TENANT_ID)
      .withType(ResourceType.EQUIPMENT)
      .build();
    await resourceRepo.save(equipment);
    const serviceA = new ServiceBuilder()
      .withDurationMinutes(30)
      .withBufferAfterMinutes(0)
      .withResourceRequirements([
        ResourceRequirement.create({ type: ResourceType.ROOM, selectionMode: 'AUTO_ANY' }),
      ])
      .build();
    const serviceB = new ServiceBuilder()
      .withDurationMinutes(20)
      .withBufferAfterMinutes(0)
      .withResourceRequirements([
        ResourceRequirement.create({ type: ResourceType.EQUIPMENT, selectionMode: 'AUTO_ANY' }),
      ])
      .build();

    const entries = await resolveAvailabilityRequirementWindows(
      resourceRepo,
      availabilityService,
      TENANT_ID,
      CANDIDATE_START,
      [serviceA, serviceB],
    );

    expect(entries).toHaveLength(2);
    expect(entries[0][0]).toMatchObject({
      resourceId: room.id,
      startsAt: CANDIDATE_START,
      endsAt: new Date('2026-06-01T10:30:00.000Z'),
    });
    // serviceB starts exactly where serviceA ended — 10:30, not 10:00.
    expect(entries[1][0]).toMatchObject({
      resourceId: equipment.id,
      startsAt: new Date('2026-06-01T10:30:00.000Z'),
      endsAt: new Date('2026-06-01T10:50:00.000Z'),
    });
  });

  it("applies the last-line buffer/turnover gap only to the final line's own window", async () => {
    const room = new ResourceBuilder()
      .withTenantId(TENANT_ID)
      .withType(ResourceType.ROOM)
      .withTurnoverMinutes(5)
      .build();
    await resourceRepo.save(room);
    const serviceA = new ServiceBuilder()
      .withDurationMinutes(30)
      .withBufferAfterMinutes(10)
      .withResourceRequirements([
        ResourceRequirement.create({ type: ResourceType.ROOM, selectionMode: 'AUTO_ANY' }),
      ])
      .build();
    const serviceB = new ServiceBuilder()
      .withDurationMinutes(20)
      .withBufferAfterMinutes(10)
      .withResourceRequirements([
        ResourceRequirement.create({ type: ResourceType.ROOM, selectionMode: 'AUTO_ANY' }),
      ])
      .build();

    const entries = await resolveAvailabilityRequirementWindows(
      resourceRepo,
      availabilityService,
      TENANT_ID,
      CANDIDATE_START,
      [serviceA, serviceB],
    );

    // First line: no gap applied (not the last line) — ends exactly at +30min.
    expect(entries[0][0].endsAt).toEqual(new Date('2026-06-01T10:30:00.000Z'));
    // Last line: max(buffer 10, turnover 5) = 10min gap applied at the very end.
    expect(entries[1][0].endsAt).toEqual(new Date('2026-06-01T11:00:00.000Z'));
  });

  it('resolves each leg to its own computeLegSpans-derived window for a legged service', async () => {
    const room = new ResourceBuilder().withTenantId(TENANT_ID).withType(ResourceType.ROOM).build();
    await resourceRepo.save(room);
    const equipment = new ResourceBuilder()
      .withTenantId(TENANT_ID)
      .withType(ResourceType.EQUIPMENT)
      .build();
    await resourceRepo.save(equipment);
    const legged = new ServiceBuilder()
      .withLegs([
        ServiceLeg.create({
          legIndex: 0,
          name: 'Etapa 1',
          durationMinutes: 20,
          resourceRequirements: [
            ResourceRequirement.create({ type: ResourceType.ROOM, selectionMode: 'AUTO_ANY' }),
          ],
          transitionGapAfterMinutes: 0,
        }),
        ServiceLeg.create({
          legIndex: 1,
          name: 'Etapa 2',
          durationMinutes: 15,
          resourceRequirements: [
            ResourceRequirement.create({ type: ResourceType.EQUIPMENT, selectionMode: 'AUTO_ANY' }),
          ],
          transitionGapAfterMinutes: 0,
        }),
      ])
      .build();

    const entries = await resolveAvailabilityRequirementWindows(
      resourceRepo,
      availabilityService,
      TENANT_ID,
      CANDIDATE_START,
      [legged],
    );

    expect(entries).toHaveLength(2);
    expect(entries[0][0]).toMatchObject({
      resourceId: room.id,
      startsAt: CANDIDATE_START,
      endsAt: new Date('2026-06-01T10:20:00.000Z'),
    });
    // Leg 1 starts right after leg 0 ends (no transition gap) — 10:20, not 10:00.
    expect(entries[1][0]).toMatchObject({
      resourceId: equipment.id,
      startsAt: new Date('2026-06-01T10:20:00.000Z'),
      endsAt: new Date('2026-06-01T10:35:00.000Z'),
    });
  });

  it("gives each of a leg's pool candidates its own turnover, not the pool's maximum", async () => {
    const lowTurnover = new ResourceBuilder()
      .withTenantId(TENANT_ID)
      .withType(ResourceType.ROOM)
      .withTurnoverMinutes(0)
      .build();
    const highTurnover = new ResourceBuilder()
      .withTenantId(TENANT_ID)
      .withType(ResourceType.ROOM)
      .withTurnoverMinutes(60)
      .build();
    await resourceRepo.save(lowTurnover);
    await resourceRepo.save(highTurnover);
    const legged = new ServiceBuilder()
      .withLegs([
        ServiceLeg.create({
          legIndex: 0,
          name: 'Etapa 1',
          durationMinutes: 20,
          resourceRequirements: [
            ResourceRequirement.create({
              type: ResourceType.ROOM,
              selectionMode: 'CUSTOMER_CHOICE',
              resourcePoolIds: [lowTurnover.id, highTurnover.id],
            }),
          ],
          transitionGapAfterMinutes: 0,
        }),
      ])
      .build();

    const entries = await resolveAvailabilityRequirementWindows(
      resourceRepo,
      availabilityService,
      TENANT_ID,
      CANDIDATE_START,
      [legged],
    );

    const [candidates] = entries;
    const lowCandidate = candidates.find((c) => c.resourceId === lowTurnover.id)!;
    const highCandidate = candidates.find((c) => c.resourceId === highTurnover.id)!;
    // Neither candidate is forced onto the pool-wide max (60min) — each keeps its own gap.
    expect(lowCandidate.endsAt).toEqual(new Date('2026-06-01T10:20:00.000Z'));
    expect(highCandidate.endsAt).toEqual(new Date('2026-06-01T11:20:00.000Z'));
  });
});

describe('isBookingWindowAvailable', () => {
  let resourceRepo: InMemoryResourceRepository;
  let availabilityService: AvailabilityService;

  beforeEach(() => {
    resourceRepo = new InMemoryResourceRepository();
    availabilityService = new AvailabilityService();
  });

  function contextFor(
    resourceId: string,
    resourcesById: Map<string, ReturnType<ResourceBuilder['build']>>,
    occupiedResourceIds: Set<string>,
  ): ResourceAvailabilityContext {
    const resource = resourcesById.get(resourceId) ?? null;
    return {
      resource,
      closures: [],
      tenantOpening: null,
      resourceOpening: null,
      occupancy: occupiedResourceIds.has(resourceId)
        ? [
            {
              resourceId,
              startsAt: new Date('2026-06-01T09:00:00.000Z'),
              endsAt: new Date('2026-06-01T12:00:00.000Z'),
            },
          ]
        : [],
    };
  }

  it('requires requiredQuantity distinct free candidates, not just one, for a fungible pool requirement', async () => {
    const roomA = new ResourceBuilder().withTenantId(TENANT_ID).withType(ResourceType.ROOM).build();
    const roomB = new ResourceBuilder().withTenantId(TENANT_ID).withType(ResourceType.ROOM).build();
    await resourceRepo.save(roomA);
    await resourceRepo.save(roomB);
    const resourcesById = new Map([
      [roomA.id, roomA],
      [roomB.id, roomB],
    ]);
    const service = new ServiceBuilder()
      .withDurationMinutes(30)
      .withResourceRequirements([
        ResourceRequirement.create({
          type: ResourceType.ROOM,
          selectionMode: 'AUTO_FUNGIBLE_POOL',
          requiredQuantity: 2,
        }),
      ])
      .build();
    const deps = {
      resourceRepo,
      availabilityService,
      tenantId: TENANT_ID,
      date: '2026-06-01',
      businessHours: OPEN_ALL_DAY_UTC,
    };

    const onlyOneFree = await isBookingWindowAvailable(
      {
        ...deps,
        loadResourceContext: (id) =>
          Promise.resolve(contextFor(id, resourcesById, new Set([roomB.id]))),
      },
      [service],
      CANDIDATE_START,
      new Map(),
    );
    expect(onlyOneFree).toBe(false);

    const bothFree = await isBookingWindowAvailable(
      {
        ...deps,
        loadResourceContext: (id) => Promise.resolve(contextFor(id, resourcesById, new Set())),
      },
      [service],
      CANDIDATE_START,
      new Map(),
    );
    expect(bothFree).toBe(true);
  });
});
