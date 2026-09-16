import { ServiceBuilder } from '../../../../test/builders/booking/index';
import { ResourceBuilder } from '../../../../test/builders/booking/resource.builder';
import { InMemoryResourceRepository } from '../../../../test/repositories/booking/in-memory-resource.repository';
import { AvailabilityService } from '../../domain/services/availability.service';
import { ResourceRequirement } from '../../domain/resource-requirement';
import { ResourceType } from '../../domain/resource.types';
import { ServiceLeg } from '../../domain/service-leg';
import { resolveAvailabilityRequirementWindows } from './availability-window-resolution.helpers';

const TENANT_ID = '00000000-0000-7000-8000-000000000001';
const CANDIDATE_START = new Date('2026-06-01T10:00:00.000Z');

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
});
