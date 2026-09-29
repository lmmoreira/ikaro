import { uuidv7 } from '../../../../shared/domain/uuid-v7';
import { InMemoryTenantLock } from '../../../../test/infrastructure/in-memory-tenant-lock';
import { ResourceBuilder, ServiceBuilder } from '../../../../test/builders/booking/index';
import { InMemoryResourceOccupancyRepository } from '../../../../test/repositories/booking/in-memory-resource-occupancy.repository';
import { InMemoryResourceRepository } from '../../../../test/repositories/booking/in-memory-resource.repository';
import {
  BookingResourceSelectionRequiredError,
  BookingServiceResourceTypeUnavailableError,
  BookingSlotUnavailableError,
} from '../../domain/errors/booking-domain.error';
import { RecurringBookingScheduleConflictError } from '../../domain/errors/recurring-booking-schedule.error';
import { Resource } from '../../domain/resource.aggregate';
import {
  ResourceRequirement,
  ResourceRequirementSelectionMode,
} from '../../domain/resource-requirement';
import { ResourceType } from '../../domain/resource.types';
import { AvailabilityService } from '../../domain/services/availability.service';
import { Service } from '../../domain/service.aggregate';
import { BookingSlotConflictService } from '../services/booking-slot-conflict.service';
import {
  assertPatternConflictFree,
  ConflictCheckDeps,
  ConflictCheckParams,
} from './recurring-booking-schedule-request.helpers';
import { resolveBookingLinesResourceCandidates } from './resource-occupancy.helpers';

const TENANT = '10000000-0000-4000-8000-000000000400';
const OTHER_TENANT = '10000000-0000-4000-8000-000000000401';
const TIMEZONE = 'America/Sao_Paulo';
const DURATION_MINUTES = 60;
const WEEK_MS = 7 * 24 * 60 * 60_000;
const FIRST_OCCURRENCE = new Date('2031-03-04T13:00:00.000Z');

type SelectionMode = Extract<
  ResourceRequirementSelectionMode,
  'CUSTOMER_CHOICE' | 'AUTO_ANY' | 'AUTO_FUNGIBLE_POOL'
>;

function occurrenceStart(index: number): Date {
  return new Date(FIRST_OCCURRENCE.getTime() + index * WEEK_MS);
}

describe('assertPatternConflictFree', () => {
  let resourceRepo: InMemoryResourceRepository;
  let occupancyRepo: InMemoryResourceOccupancyRepository;
  let tenantLock: InMemoryTenantLock;
  let deps: ConflictCheckDeps;

  beforeEach(() => {
    resourceRepo = new InMemoryResourceRepository();
    occupancyRepo = new InMemoryResourceOccupancyRepository();
    tenantLock = new InMemoryTenantLock();
    deps = {
      resourceRepo,
      availabilityService: new AvailabilityService(),
      occupancyRepo,
      tenantLock,
    };
  });

  async function seedRooms(count: number, turnoverMinutes = 0): Promise<Resource[]> {
    const rooms: Resource[] = [];
    for (let i = 0; i < count; i++) {
      const room = new ResourceBuilder()
        .withTenantId(TENANT)
        .withType(ResourceType.ROOM)
        .withName(`Sala ${i + 1}`)
        .withTurnoverMinutes(turnoverMinutes)
        .build();
      await resourceRepo.save(room);
      rooms.push(room);
    }
    return rooms;
  }

  function buildService(selectionMode: SelectionMode, bufferAfterMinutes: number | null = null) {
    return new ServiceBuilder()
      .withTenantId(TENANT)
      .withBookingModel('APPOINTMENT')
      .withBufferAfterMinutes(bufferAfterMinutes)
      .withResourceRequirements([
        ResourceRequirement.create({ type: ResourceType.ROOM, selectionMode }),
      ])
      .build();
  }

  function buildParams(
    service: Service,
    occurrenceCount: number,
    resourceIds: string[] = [],
  ): ConflictCheckParams {
    return {
      tenantId: TENANT,
      timezone: TIMEZONE,
      assignmentPolicy: resourceIds.length > 0 ? 'FIXED_ASSIGNMENT' : 'RESOLVE_PER_OCCURRENCE',
      resourceIds,
      recurrence: {
        frequency: 'WEEKLY',
        daysOfWeek: ['tuesday'],
        startTime: '10:00',
        durationMinutes: DURATION_MINUTES,
      },
      service,
      occurrences: Array.from({ length: occurrenceCount }, (_, i) => ({
        occurrenceStart: occurrenceStart(i),
      })),
    };
  }

  function occupy(
    resource: Resource,
    startsAt: Date,
    options: { tenantId?: string; minutes?: number } = {},
  ): void {
    occupancyRepo.seed(options.tenantId ?? TENANT, uuidv7(), {
      resourceId: resource.id,
      resourceType: ResourceType.ROOM,
      resourceName: resource.name,
      legIndex: null,
      quantityPosition: null,
      selectionMode: 'CUSTOMER_CHOICE',
      isBundleMember: false,
      startsAt,
      endsAt: new Date(startsAt.getTime() + (options.minutes ?? DURATION_MINUTES) * 60_000),
    });
  }

  describe('FIXED_ASSIGNMENT', () => {
    it('rejects when only the 5th of 8 occurrences overlaps, with one lock call and one overlap query', async () => {
      const [room] = await seedRooms(1);
      occupy(room, occurrenceStart(4));
      const lockSpy = jest.spyOn(tenantLock, 'lockResources');
      const windowsSpy = jest.spyOn(occupancyRepo, 'findConflictingWindows');

      await expect(
        assertPatternConflictFree(deps, buildParams(buildService('CUSTOMER_CHOICE'), 8, [room.id])),
      ).rejects.toThrow(RecurringBookingScheduleConflictError);

      expect(lockSpy).toHaveBeenCalledTimes(1);
      expect(lockSpy).toHaveBeenCalledWith(TENANT, [room.id]);
      expect(windowsSpy).toHaveBeenCalledTimes(1);
      expect(windowsSpy.mock.calls[0][1]).toHaveLength(8);
    });

    it('accepts when no occurrence overlaps, with one lock call and one overlap query', async () => {
      const [room] = await seedRooms(1);
      occupy(room, new Date(occurrenceStart(0).getTime() + 3 * 60 * 60_000));
      const lockSpy = jest.spyOn(tenantLock, 'lockResources');
      const windowsSpy = jest.spyOn(occupancyRepo, 'findConflictingWindows');

      await expect(
        assertPatternConflictFree(deps, buildParams(buildService('CUSTOMER_CHOICE'), 8, [room.id])),
      ).resolves.toBeUndefined();

      expect(lockSpy).toHaveBeenCalledTimes(1);
      expect(windowsSpy).toHaveBeenCalledTimes(1);
    });

    it('rejects a resource that is not an active resource of the required type', async () => {
      await seedRooms(1);

      await expect(
        assertPatternConflictFree(
          deps,
          buildParams(buildService('CUSTOMER_CHOICE'), 2, [uuidv7()]),
        ),
      ).rejects.toThrow(BookingServiceResourceTypeUnavailableError);
    });

    it('requires a caller-chosen resource', async () => {
      await seedRooms(1);
      const params = {
        ...buildParams(buildService('CUSTOMER_CHOICE'), 2),
        assignmentPolicy: 'FIXED_ASSIGNMENT' as const,
      };

      await expect(assertPatternConflictFree(deps, params)).rejects.toThrow(
        BookingResourceSelectionRequiredError,
      );
    });
  });

  describe('AUTO_ANY', () => {
    it('accepts an occurrence while at least one eligible resource is free', async () => {
      const rooms = await seedRooms(3);
      occupy(rooms[0], occurrenceStart(2));
      occupy(rooms[1], occurrenceStart(2));

      await expect(
        assertPatternConflictFree(deps, buildParams(buildService('AUTO_ANY'), 4)),
      ).resolves.toBeUndefined();
    });

    it('rejects an occurrence where every eligible resource is busy', async () => {
      const rooms = await seedRooms(3);
      rooms.forEach((room) => occupy(room, occurrenceStart(3)));
      const lockSpy = jest.spyOn(tenantLock, 'lockResources');
      const windowsSpy = jest.spyOn(occupancyRepo, 'findConflictingWindows');

      await expect(
        assertPatternConflictFree(deps, buildParams(buildService('AUTO_ANY'), 6)),
      ).rejects.toThrow(RecurringBookingScheduleConflictError);

      expect(lockSpy).toHaveBeenCalledTimes(1);
      expect(lockSpy.mock.calls[0][1].sort()).toEqual(rooms.map((room) => room.id).sort());
      expect(windowsSpy).toHaveBeenCalledTimes(1);
      expect(windowsSpy.mock.calls[0][1]).toHaveLength(18);
    });

    it('fails when the tenant has no active resource of the required type', async () => {
      await expect(
        assertPatternConflictFree(deps, buildParams(buildService('AUTO_ANY'), 2)),
      ).rejects.toThrow(BookingServiceResourceTypeUnavailableError);
    });
  });

  describe('AUTO_FUNGIBLE_POOL', () => {
    it('rejects when the first eligible resource is busy even though another one is free', async () => {
      await seedRooms(2);
      const [first] = await resourceRepo.findByTenant(TENANT, {
        type: ResourceType.ROOM,
        isActive: true,
      });
      occupy(first, occurrenceStart(1));
      const lockSpy = jest.spyOn(tenantLock, 'lockResources');

      await expect(
        assertPatternConflictFree(deps, buildParams(buildService('AUTO_FUNGIBLE_POOL'), 3)),
      ).rejects.toThrow(RecurringBookingScheduleConflictError);

      expect(lockSpy).toHaveBeenCalledWith(TENANT, [first.id]);
    });

    it('accepts when the first eligible resource is free even though another one is busy', async () => {
      await seedRooms(2);
      const [first, second] = await resourceRepo.findByTenant(TENANT, {
        type: ResourceType.ROOM,
        isActive: true,
      });
      occupy(second, occurrenceStart(1));
      expect(first.id).not.toBe(second.id);

      await expect(
        assertPatternConflictFree(deps, buildParams(buildService('AUTO_FUNGIBLE_POOL'), 3)),
      ).resolves.toBeUndefined();
    });
  });

  describe('shared behavior', () => {
    it('does nothing for a pattern with zero occurrences', async () => {
      const [room] = await seedRooms(1);
      const lockSpy = jest.spyOn(tenantLock, 'lockResources');
      const windowsSpy = jest.spyOn(occupancyRepo, 'findConflictingWindows');
      const findByIdSpy = jest.spyOn(resourceRepo, 'findById');

      await expect(
        assertPatternConflictFree(deps, buildParams(buildService('CUSTOMER_CHOICE'), 0, [room.id])),
      ).resolves.toBeUndefined();

      expect(lockSpy).not.toHaveBeenCalled();
      expect(windowsSpy).not.toHaveBeenCalled();
      expect(findByIdSpy).not.toHaveBeenCalled();
    });

    it("extends each window by the resource's own turnover gap", async () => {
      const [room] = await seedRooms(1, 30);
      occupy(room, new Date(occurrenceStart(1).getTime() + (DURATION_MINUTES + 15) * 60_000), {
        minutes: 30,
      });

      await expect(
        assertPatternConflictFree(deps, buildParams(buildService('CUSTOMER_CHOICE'), 3, [room.id])),
      ).rejects.toThrow(RecurringBookingScheduleConflictError);
    });

    it('uses the service buffer when it is larger than the resource turnover', async () => {
      const [room] = await seedRooms(1, 5);
      occupy(room, new Date(occurrenceStart(1).getTime() + (DURATION_MINUTES + 20) * 60_000), {
        minutes: 30,
      });

      await expect(
        assertPatternConflictFree(
          deps,
          buildParams(buildService('CUSTOMER_CHOICE', 30), 3, [room.id]),
        ),
      ).rejects.toThrow(RecurringBookingScheduleConflictError);
    });

    it('does not extend the window when neither the buffer nor the turnover reaches the next booking', async () => {
      const [room] = await seedRooms(1, 5);
      occupy(room, new Date(occurrenceStart(1).getTime() + (DURATION_MINUTES + 20) * 60_000), {
        minutes: 30,
      });

      await expect(
        assertPatternConflictFree(
          deps,
          buildParams(buildService('CUSTOMER_CHOICE', 10), 3, [room.id]),
        ),
      ).resolves.toBeUndefined();
    });

    it("never treats another tenant's occupancy as a conflict", async () => {
      const [room] = await seedRooms(1);
      occupy(room, occurrenceStart(2), { tenantId: OTHER_TENANT });

      await expect(
        assertPatternConflictFree(deps, buildParams(buildService('CUSTOMER_CHOICE'), 4, [room.id])),
      ).resolves.toBeUndefined();
    });
  });

  // The batched check must accept and reject exactly what resolving and checking each occurrence
  // on its own does — the per-occurrence flow a one-off booking uses.
  describe('parity with the per-occurrence check', () => {
    const OCCURRENCE_COUNT = 5;

    async function perOccurrenceAccepts(
      service: Service,
      params: ConflictCheckParams,
    ): Promise<boolean> {
      const slotConflictService = new BookingSlotConflictService(occupancyRepo, tenantLock);
      const requirement = service.resourceRequirements[0];
      const resourceSelections = params.resourceIds.map((resourceId) => ({
        serviceId: service.id,
        legIndex: null,
        resourceType: requirement.type,
        resourceId,
      }));
      try {
        for (const { occurrenceStart: scheduledAt } of params.occurrences) {
          const lineId = uuidv7();
          const resolved = await resolveBookingLinesResourceCandidates({
            resourceRepo,
            availabilityService: deps.availabilityService,
            occupancyRepo,
            tenantId: TENANT,
            scheduledAt,
            timezone: TIMEZONE,
            lines: [{ lineId, serviceId: service.id, durationMinsAtBooking: DURATION_MINUTES }],
            serviceMap: new Map([[service.id, service]]),
            resourceSelections,
          });
          await slotConflictService.assertSlotFree(TENANT, resolved.get(lineId)!.candidates);
        }
        return true;
      } catch (error) {
        if (error instanceof BookingSlotUnavailableError) return false;
        throw error;
      }
    }

    async function batchedAccepts(params: ConflictCheckParams): Promise<boolean> {
      try {
        await assertPatternConflictFree(deps, params);
        return true;
      } catch (error) {
        if (error instanceof RecurringBookingScheduleConflictError) return false;
        throw error;
      }
    }

    // Each busy entry is [resource index, occurrence index].
    const scenarios: { name: string; busy: [number, number][] }[] = [
      { name: 'nothing is busy', busy: [] },
      { name: 'the first resource is busy on one occurrence', busy: [[0, 2]] },
      { name: 'the second resource is busy on one occurrence', busy: [[1, 2]] },
      {
        name: 'two of three resources are busy on the same occurrence',
        busy: [
          [0, 3],
          [1, 3],
        ],
      },
      {
        name: 'every resource is busy on the same occurrence',
        busy: [
          [0, 3],
          [1, 3],
          [2, 3],
        ],
      },
      {
        name: 'different resources are busy on different occurrences',
        busy: [
          [0, 0],
          [1, 1],
          [2, 4],
        ],
      },
    ];
    const modes: SelectionMode[] = ['CUSTOMER_CHOICE', 'AUTO_ANY', 'AUTO_FUNGIBLE_POOL'];

    it.each(modes.flatMap((mode) => scenarios.map((scenario) => ({ mode, ...scenario }))))(
      '$mode agrees with the per-occurrence check when $name',
      async ({ mode, busy }) => {
        const rooms = await seedRooms(3, 10);
        busy.forEach(([roomIndex, occurrenceIndex]) =>
          occupy(rooms[roomIndex], occurrenceStart(occurrenceIndex)),
        );
        const service = buildService(mode, 15);
        const [firstEligible] = await resourceRepo.findByTenant(TENANT, {
          type: ResourceType.ROOM,
          isActive: true,
        });
        const params = buildParams(
          service,
          OCCURRENCE_COUNT,
          mode === 'CUSTOMER_CHOICE' ? [firstEligible.id] : [],
        );

        expect(await batchedAccepts(params)).toBe(await perOccurrenceAccepts(service, params));
      },
    );
  });
});
