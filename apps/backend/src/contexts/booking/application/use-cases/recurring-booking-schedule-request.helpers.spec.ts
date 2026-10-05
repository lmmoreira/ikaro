import { uuidv7 } from '../../../../shared/domain/uuid-v7';
import { addDaysUTC } from '../../../../shared/utils/calendar-date';
import type { BusinessHours } from '../../../../shared/value-objects/business-hours.vo';
import { InMemoryTenantLock } from '../../../../test/infrastructure/in-memory-tenant-lock';
import {
  ResourceBuilder,
  ScheduleClosureBuilder,
  ScheduleOpeningBuilder,
  ServiceBuilder,
} from '../../../../test/builders/booking/index';
import { InMemoryScheduleClosureRepository } from '../../../../test/repositories/booking/in-memory-schedule-closure.repository';
import { InMemoryScheduleOpeningRepository } from '../../../../test/repositories/booking/in-memory-schedule-opening.repository';
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
const FIRST_OCCURRENCE_LOCAL_DATE = '2031-03-04'; // a Tuesday; 13:00Z is 10:00 in America/Sao_Paulo

// Mon-Sat 09:00-18:00 tenant-local; occurrences are Tuesdays 10:00-11:00, so they sit inside it.
const BUSINESS_HOURS: BusinessHours = {
  timezone: TIMEZONE,
  monday: { open: '09:00', close: '18:00' },
  tuesday: { open: '09:00', close: '18:00' },
  wednesday: { open: '09:00', close: '18:00' },
  thursday: { open: '09:00', close: '18:00' },
  friday: { open: '09:00', close: '18:00' },
  saturday: { open: '09:00', close: '17:00' },
  sunday: null,
};

type SelectionMode = Extract<
  ResourceRequirementSelectionMode,
  'CUSTOMER_CHOICE' | 'AUTO_ANY' | 'AUTO_FUNGIBLE_POOL'
>;

function occurrenceStart(index: number): Date {
  return new Date(FIRST_OCCURRENCE.getTime() + index * WEEK_MS);
}

function occurrenceLocalDate(index: number): string {
  return addDaysUTC(FIRST_OCCURRENCE_LOCAL_DATE, index * 7);
}

describe('assertPatternConflictFree', () => {
  let resourceRepo: InMemoryResourceRepository;
  let occupancyRepo: InMemoryResourceOccupancyRepository;
  let closureRepo: InMemoryScheduleClosureRepository;
  let openingRepo: InMemoryScheduleOpeningRepository;
  let tenantLock: InMemoryTenantLock;
  let deps: ConflictCheckDeps;

  beforeEach(() => {
    resourceRepo = new InMemoryResourceRepository();
    occupancyRepo = new InMemoryResourceOccupancyRepository();
    closureRepo = new InMemoryScheduleClosureRepository();
    openingRepo = new InMemoryScheduleOpeningRepository();
    tenantLock = new InMemoryTenantLock();
    deps = {
      resourceRepo,
      availabilityService: new AvailabilityService(),
      occupancyRepo,
      closureRepo,
      openingRepo,
      tenantLock,
    };
  });

  async function seedResources(
    count: number,
    turnoverMinutes = 0,
    type: ResourceType = ResourceType.ROOM,
  ): Promise<Resource[]> {
    const resources: Resource[] = [];
    for (let i = 0; i < count; i++) {
      const resource = new ResourceBuilder()
        .withTenantId(TENANT)
        .withType(type)
        .withName(`Recurso ${i + 1}`)
        .withRefId(type === ResourceType.STAFF ? uuidv7() : null)
        .withTurnoverMinutes(turnoverMinutes)
        .build();
      await resourceRepo.save(resource);
      resources.push(resource);
    }
    return resources;
  }

  function buildService(
    selectionMode: SelectionMode,
    bufferAfterMinutes: number | null = null,
    requirement: { type?: ResourceType; resourcePoolIds?: string[] } = {},
  ) {
    return new ServiceBuilder()
      .withTenantId(TENANT)
      .withBookingModel('APPOINTMENT')
      .withBufferAfterMinutes(bufferAfterMinutes)
      .withResourceRequirements([
        ResourceRequirement.create({
          type: requirement.type ?? ResourceType.ROOM,
          selectionMode,
          resourcePoolIds: requirement.resourcePoolIds,
        }),
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
      businessHours: BUSINESS_HOURS,
      assignmentPolicy: resourceIds.length > 0 ? 'FIXED_ASSIGNMENT' : 'RESOLVE_PER_OCCURRENCE',
      resourceIds,
      recurrence: {
        frequency: 'WEEKLY',
        daysOfWeek: ['tuesday'],
        startTime: '10:00',
        durationMinutes: DURATION_MINUTES,
      },
      service,
      startsOn: FIRST_OCCURRENCE_LOCAL_DATE,
      endsOn: occurrenceLocalDate(Math.max(occurrenceCount - 1, 0)),
      occurrences: Array.from({ length: occurrenceCount }, (_, i) => ({
        occurrenceStart: occurrenceStart(i),
        occurrenceStartLocalDate: occurrenceLocalDate(i),
      })),
    };
  }

  function occupy(
    resource: Resource,
    startsAt: Date,
    options: { tenantId?: string; minutes?: number } = {},
  ): void {
    occupancyRepo.seed(
      options.tenantId ?? TENANT,
      uuidv7(),
      occupancyCandidate(resource, startsAt, options.minutes),
    );
  }

  function occupancyCandidate(resource: Resource, startsAt: Date, minutes = DURATION_MINUTES) {
    return {
      resourceId: resource.id,
      resourceType: resource.type,
      resourceName: resource.name,
      legIndex: null,
      quantityPosition: null,
      selectionMode: 'CUSTOMER_CHOICE' as const,
      isBundleMember: false,
      gapMinutes: null,
      gapSource: null,
      startsAt,
      endsAt: new Date(startsAt.getTime() + minutes * 60_000),
    };
  }

  async function occupyWithState(
    resource: Resource,
    startsAt: Date,
    lockState: 'HOLD' | 'REQUESTED',
  ): Promise<void> {
    const holdExpiresAt = lockState === 'HOLD' ? new Date(startsAt.getTime()) : null;
    await occupancyRepo.assign(
      TENANT,
      uuidv7(),
      [occupancyCandidate(resource, startsAt)],
      lockState,
      holdExpiresAt,
    );
  }

  describe('FIXED_ASSIGNMENT', () => {
    it('rejects when only the 5th of 8 occurrences overlaps, with one lock call and one overlap query', async () => {
      const [room] = await seedResources(1);
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
      const [room] = await seedResources(1);
      occupy(room, new Date(occurrenceStart(0).getTime() + 3 * 60 * 60_000));
      const lockSpy = jest.spyOn(tenantLock, 'lockResources');
      const windowsSpy = jest.spyOn(occupancyRepo, 'findConflictingWindows');

      await expect(
        assertPatternConflictFree(deps, buildParams(buildService('CUSTOMER_CHOICE'), 8, [room.id])),
      ).resolves.toEqual(expect.any(Array));

      expect(lockSpy).toHaveBeenCalledTimes(1);
      expect(windowsSpy).toHaveBeenCalledTimes(1);
    });

    it('rejects a resource that is not an active resource of the required type', async () => {
      await seedResources(1);

      await expect(
        assertPatternConflictFree(
          deps,
          buildParams(buildService('CUSTOMER_CHOICE'), 2, [uuidv7()]),
        ),
      ).rejects.toThrow(BookingServiceResourceTypeUnavailableError);
    });

    it('requires a caller-chosen resource', async () => {
      await seedResources(1);
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
      const rooms = await seedResources(3);
      occupy(rooms[0], occurrenceStart(2));
      occupy(rooms[1], occurrenceStart(2));

      await expect(
        assertPatternConflictFree(deps, buildParams(buildService('AUTO_ANY'), 4)),
      ).resolves.toEqual(expect.any(Array));
    });

    it('rejects an occurrence where every eligible resource is busy', async () => {
      const rooms = await seedResources(3);
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
      await seedResources(2);
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
      await seedResources(2);
      const [first, second] = await resourceRepo.findByTenant(TENANT, {
        type: ResourceType.ROOM,
        isActive: true,
      });
      occupy(second, occurrenceStart(1));
      expect(first.id).not.toBe(second.id);

      await expect(
        assertPatternConflictFree(deps, buildParams(buildService('AUTO_FUNGIBLE_POOL'), 3)),
      ).resolves.toEqual(expect.any(Array));
    });
  });

  describe('shared behavior', () => {
    it('does nothing for a pattern with zero occurrences', async () => {
      const [room] = await seedResources(1);
      const lockSpy = jest.spyOn(tenantLock, 'lockResources');
      const windowsSpy = jest.spyOn(occupancyRepo, 'findConflictingWindows');
      const findByIdSpy = jest.spyOn(resourceRepo, 'findById');

      await expect(
        assertPatternConflictFree(deps, buildParams(buildService('CUSTOMER_CHOICE'), 0, [room.id])),
      ).resolves.toEqual([]);

      expect(closureRepo.rangeQueryCount).toBe(0);
      expect(openingRepo.rangeQueryCount).toBe(0);
      expect(lockSpy).not.toHaveBeenCalled();
      expect(windowsSpy).not.toHaveBeenCalled();
      expect(findByIdSpy).not.toHaveBeenCalled();
    });

    it("extends each window by the resource's own turnover gap", async () => {
      const [room] = await seedResources(1, 30);
      occupy(room, new Date(occurrenceStart(1).getTime() + (DURATION_MINUTES + 15) * 60_000), {
        minutes: 30,
      });

      await expect(
        assertPatternConflictFree(deps, buildParams(buildService('CUSTOMER_CHOICE'), 3, [room.id])),
      ).rejects.toThrow(RecurringBookingScheduleConflictError);
    });

    it('uses the service buffer when it is larger than the resource turnover', async () => {
      const [room] = await seedResources(1, 5);
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
      const [room] = await seedResources(1, 5);
      occupy(room, new Date(occurrenceStart(1).getTime() + (DURATION_MINUTES + 20) * 60_000), {
        minutes: 30,
      });

      await expect(
        assertPatternConflictFree(
          deps,
          buildParams(buildService('CUSTOMER_CHOICE', 10), 3, [room.id]),
        ),
      ).resolves.toEqual(expect.any(Array));
    });

    it("never treats another tenant's occupancy as a conflict", async () => {
      const [room] = await seedResources(1);
      occupy(room, occurrenceStart(2), { tenantId: OTHER_TENANT });

      await expect(
        assertPatternConflictFree(deps, buildParams(buildService('CUSTOMER_CHOICE'), 4, [room.id])),
      ).resolves.toEqual(expect.any(Array));
    });
  });

  describe.each([ResourceType.STAFF, ResourceType.EQUIPMENT, ResourceType.LOCATION])(
    'a %s requirement',
    (type) => {
      it('FIXED_ASSIGNMENT rejects a conflict on a later occurrence', async () => {
        const [resource] = await seedResources(1, 0, type);
        occupy(resource, occurrenceStart(2));

        await expect(
          assertPatternConflictFree(
            deps,
            buildParams(buildService('CUSTOMER_CHOICE', null, { type }), 4, [resource.id]),
          ),
        ).rejects.toThrow(RecurringBookingScheduleConflictError);
      });

      it('FIXED_ASSIGNMENT accepts when the resource is free', async () => {
        const [resource] = await seedResources(1, 0, type);

        await expect(
          assertPatternConflictFree(
            deps,
            buildParams(buildService('CUSTOMER_CHOICE', null, { type }), 4, [resource.id]),
          ),
        ).resolves.toEqual(expect.any(Array));
      });

      it('AUTO_ANY rejects only when every resource of the type is busy', async () => {
        const resources = await seedResources(2, 0, type);
        const service = buildService('AUTO_ANY', null, { type });
        occupy(resources[0], occurrenceStart(1));

        await expect(assertPatternConflictFree(deps, buildParams(service, 3))).resolves.toEqual(
          expect.any(Array),
        );

        occupy(resources[1], occurrenceStart(1));

        await expect(assertPatternConflictFree(deps, buildParams(service, 3))).rejects.toThrow(
          RecurringBookingScheduleConflictError,
        );
      });
    },
  );

  describe('a pool-restricted requirement', () => {
    it('AUTO_ANY only considers pool members, even when a resource outside the pool is free', async () => {
      const [inPoolA, inPoolB, outsidePool] = await seedResources(3);
      const service = buildService('AUTO_ANY', null, {
        resourcePoolIds: [inPoolA.id, inPoolB.id],
      });
      occupy(inPoolA, occurrenceStart(2));
      occupy(inPoolB, occurrenceStart(2));
      const lockSpy = jest.spyOn(tenantLock, 'lockResources');

      await expect(assertPatternConflictFree(deps, buildParams(service, 4))).rejects.toThrow(
        RecurringBookingScheduleConflictError,
      );

      expect(lockSpy.mock.calls[0][1].sort()).toEqual([inPoolA.id, inPoolB.id].sort());
      expect(lockSpy.mock.calls[0][1]).not.toContain(outsidePool.id);
    });

    it('AUTO_ANY accepts while one pool member is free', async () => {
      const [inPoolA, inPoolB] = await seedResources(3);
      const service = buildService('AUTO_ANY', null, {
        resourcePoolIds: [inPoolA.id, inPoolB.id],
      });
      occupy(inPoolA, occurrenceStart(2));

      await expect(assertPatternConflictFree(deps, buildParams(service, 4))).resolves.toEqual(
        expect.any(Array),
      );
    });

    it('AUTO_FUNGIBLE_POOL checks only the first eligible pool member', async () => {
      const rooms = await seedResources(3);
      const poolIds = [rooms[1].id, rooms[2].id];
      const service = buildService('AUTO_FUNGIBLE_POOL', null, { resourcePoolIds: poolIds });
      const [firstEligible] = (
        await resourceRepo.findByTenant(TENANT, { type: ResourceType.ROOM, isActive: true })
      ).filter((resource) => poolIds.includes(resource.id));
      occupy(firstEligible, occurrenceStart(1));
      const lockSpy = jest.spyOn(tenantLock, 'lockResources');

      await expect(assertPatternConflictFree(deps, buildParams(service, 3))).rejects.toThrow(
        RecurringBookingScheduleConflictError,
      );

      expect(lockSpy).toHaveBeenCalledWith(TENANT, [firstEligible.id]);
    });
  });

  describe('inactive resources', () => {
    it('FIXED_ASSIGNMENT rejects a deactivated chosen resource as unavailable, not as a conflict', async () => {
      const [room] = await seedResources(1);
      room.deactivate();
      await resourceRepo.save(room);

      await expect(
        assertPatternConflictFree(deps, buildParams(buildService('CUSTOMER_CHOICE'), 3, [room.id])),
      ).rejects.toThrow(BookingServiceResourceTypeUnavailableError);
    });

    it('AUTO_ANY never counts a deactivated resource as free', async () => {
      const [active, inactive] = await seedResources(2);
      inactive.deactivate();
      await resourceRepo.save(inactive);
      occupy(active, occurrenceStart(1));

      await expect(
        assertPatternConflictFree(deps, buildParams(buildService('AUTO_ANY'), 3)),
      ).rejects.toThrow(RecurringBookingScheduleConflictError);
    });

    it('AUTO_ANY fails as unavailable when every resource of the type is deactivated', async () => {
      const [room] = await seedResources(1);
      room.deactivate();
      await resourceRepo.save(room);

      await expect(
        assertPatternConflictFree(deps, buildParams(buildService('AUTO_ANY'), 3)),
      ).rejects.toThrow(BookingServiceResourceTypeUnavailableError);
    });
  });

  describe('occupancy lock states', () => {
    it('a HOLD row (a pending manual-approval booking) blocks the occurrence', async () => {
      const [room] = await seedResources(1);
      await occupyWithState(room, occurrenceStart(2), 'HOLD');

      await expect(
        assertPatternConflictFree(deps, buildParams(buildService('CUSTOMER_CHOICE'), 4, [room.id])),
      ).rejects.toThrow(RecurringBookingScheduleConflictError);
    });

    it('a REQUESTED row is never a conflict', async () => {
      const [room] = await seedResources(1);
      await occupyWithState(room, occurrenceStart(2), 'REQUESTED');

      await expect(
        assertPatternConflictFree(deps, buildParams(buildService('CUSTOMER_CHOICE'), 4, [room.id])),
      ).resolves.toEqual(expect.any(Array));
    });
  });

  describe('a long horizon', () => {
    const DAILY_OCCURRENCES = 90;

    it('FIXED_ASSIGNMENT checks 90 occurrences with one lock call and one overlap query', async () => {
      const [room] = await seedResources(1);
      const lockSpy = jest.spyOn(tenantLock, 'lockResources');
      const windowsSpy = jest.spyOn(occupancyRepo, 'findConflictingWindows');

      await assertPatternConflictFree(
        deps,
        buildParams(buildService('CUSTOMER_CHOICE'), DAILY_OCCURRENCES, [room.id]),
      );

      expect(lockSpy).toHaveBeenCalledTimes(1);
      expect(windowsSpy).toHaveBeenCalledTimes(1);
      expect(windowsSpy.mock.calls[0][1]).toHaveLength(DAILY_OCCURRENCES);
    });

    it('AUTO_ANY checks 90 occurrences across 3 resources with one lock call and one overlap query', async () => {
      await seedResources(3);
      const lockSpy = jest.spyOn(tenantLock, 'lockResources');
      const windowsSpy = jest.spyOn(occupancyRepo, 'findConflictingWindows');
      const findByTenantSpy = jest.spyOn(resourceRepo, 'findByTenant');
      const findByIdSpy = jest.spyOn(resourceRepo, 'findById');

      await assertPatternConflictFree(
        deps,
        buildParams(buildService('AUTO_ANY'), DAILY_OCCURRENCES),
      );

      expect(lockSpy).toHaveBeenCalledTimes(1);
      expect(windowsSpy).toHaveBeenCalledTimes(1);
      expect(windowsSpy.mock.calls[0][1]).toHaveLength(DAILY_OCCURRENCES * 3);
      expect(findByTenantSpy).toHaveBeenCalledTimes(1);
      expect(findByIdSpy).not.toHaveBeenCalled();
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
        const rooms = await seedResources(3, 10);
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

  // M23-S18 — working hours and closures: the same rule availability applies, checked for every
  // occurrence of the term, with hours and occupancy refusals merged into one list.
  describe('working hours, closures and the merged conflict list', () => {
    async function conflictsOf(params: ConflictCheckParams) {
      try {
        await assertPatternConflictFree(deps, params);
      } catch (error) {
        if (error instanceof RecurringBookingScheduleConflictError) return error.conflicts;
        throw error;
      }
      return [];
    }

    async function closeFullDay(index: number, resource?: Resource): Promise<void> {
      const builder = new ScheduleClosureBuilder()
        .withTenantId(TENANT)
        .withDate(occurrenceLocalDate(index));
      await closureRepo.save((resource ? builder.withResourceId(resource.id) : builder).build());
    }

    function withHours(params: ConflictCheckParams, tuesday: BusinessHours['tuesday']) {
      return { ...params, businessHours: { ...BUSINESS_HOURS, tuesday } };
    }

    it('lists a tenant-wide closure on only the 5th occurrence as CLOSED', async () => {
      const [room] = await seedResources(1);
      await closeFullDay(4);

      const conflicts = await conflictsOf(
        buildParams(buildService('CUSTOMER_CHOICE'), 8, [room.id]),
      );

      expect(conflicts).toEqual([{ occurrenceStart: occurrenceStart(4), reason: 'CLOSED' }]);
    });

    it('plans an AUTO_ANY occurrence onto the open resource when the other one is closed that day', async () => {
      const [first, second] = (await seedResources(2)).sort((a, b) => a.id.localeCompare(b.id));
      // Both are free of bookings and equally loaded, so the id tie-break would pick `first` — but
      // `first` is closed on the second occurrence, which is still accepted because `second` is open.
      await closeFullDay(1, first);

      const plan = await assertPatternConflictFree(deps, buildParams(buildService('AUTO_ANY'), 3));

      expect(plan.map((resource) => resource.id)).toEqual([first.id, second.id, first.id]);
    });

    it('plans an AUTO_ANY occurrence around a resource that is busy and one that is closed', async () => {
      const [a, b, c] = (await seedResources(3)).sort((x, y) => x.id.localeCompare(y.id));
      occupy(a, occurrenceStart(0));
      await closeFullDay(0, b);

      const plan = await assertPatternConflictFree(deps, buildParams(buildService('AUTO_ANY'), 2));

      expect(plan[0].id).toBe(c.id);
    });

    it('accepts the same pattern when the closure falls on a day with no occurrence', async () => {
      const [room] = await seedResources(1);
      await closureRepo.save(
        new ScheduleClosureBuilder()
          .withTenantId(TENANT)
          .withDate(addDaysUTC(occurrenceLocalDate(4), 1))
          .build(),
      );

      await expect(
        assertPatternConflictFree(deps, buildParams(buildService('CUSTOMER_CHOICE'), 8, [room.id])),
      ).resolves.toEqual(expect.any(Array));
    });

    it('lists a partial closure that overlaps the occurrence window as CLOSED', async () => {
      const [room] = await seedResources(1);
      await closureRepo.save(
        new ScheduleClosureBuilder()
          .withTenantId(TENANT)
          .withDate(occurrenceLocalDate(1))
          .withStartTime('10:30')
          .withEndTime('12:00')
          .build(),
      );

      const conflicts = await conflictsOf(
        buildParams(buildService('CUSTOMER_CHOICE'), 3, [room.id]),
      );

      expect(conflicts).toEqual([{ occurrenceStart: occurrenceStart(1), reason: 'CLOSED' }]);
    });

    it('lists every occurrence as OUTSIDE_HOURS when the business opens after the requested time', async () => {
      const [room] = await seedResources(1);
      const params = withHours(buildParams(buildService('CUSTOMER_CHOICE'), 3, [room.id]), {
        open: '12:00',
        close: '18:00',
      });

      const conflicts = await conflictsOf(params);

      expect(conflicts.map((c) => c.reason)).toEqual([
        'OUTSIDE_HOURS',
        'OUTSIDE_HOURS',
        'OUTSIDE_HOURS',
      ]);
    });

    it('lists a normally-closed weekday as CLOSED, and accepts it once an opening makes it open', async () => {
      const [room] = await seedResources(1);
      const params = withHours(buildParams(buildService('CUSTOMER_CHOICE'), 2, [room.id]), null);

      expect((await conflictsOf(params)).map((c) => c.reason)).toEqual(['CLOSED', 'CLOSED']);

      for (const index of [0, 1]) {
        await openingRepo.save(
          new ScheduleOpeningBuilder()
            .withTenantId(TENANT)
            .withDate(occurrenceLocalDate(index))
            .withStartTime('09:00')
            .withEndTime('18:00')
            .build(),
        );
      }
      expect(await conflictsOf(params)).toEqual([]);
    });

    it("respects a resource's own working hours when narrower than the business's", async () => {
      const [room] = await seedResources(1);
      const resource = new ResourceBuilder()
        .withTenantId(TENANT)
        .withType(ResourceType.ROOM)
        .withName('Sala vespertina')
        .withTenantBusinessHours(BUSINESS_HOURS)
        .withWorkingHours({
          ...BUSINESS_HOURS,
          tuesday: { open: '14:00', close: '18:00' },
        })
        .build();
      await resourceRepo.save(resource);

      expect(
        await conflictsOf(buildParams(buildService('CUSTOMER_CHOICE'), 2, [resource.id])),
      ).toHaveLength(2);
      expect(
        await conflictsOf(buildParams(buildService('CUSTOMER_CHOICE'), 2, [room.id])),
      ).toHaveLength(0);
    });

    it('a resource-scoped closure affects only requests that use that resource', async () => {
      const [roomA, roomB] = await seedResources(2);
      await closeFullDay(1, roomA);
      const service = buildService('CUSTOMER_CHOICE');

      expect(await conflictsOf(buildParams(service, 3, [roomA.id]))).toEqual([
        { occurrenceStart: occurrenceStart(1), reason: 'CLOSED' },
      ]);
      expect(await conflictsOf(buildParams(service, 3, [roomB.id]))).toEqual([]);
    });

    it('a tenant-wide closure affects every request', async () => {
      const [roomA, roomB] = await seedResources(2);
      await closeFullDay(1);
      const service = buildService('CUSTOMER_CHOICE');

      expect(await conflictsOf(buildParams(service, 3, [roomA.id]))).toHaveLength(1);
      expect(await conflictsOf(buildParams(service, 3, [roomB.id]))).toHaveLength(1);
    });

    it("never lets another tenant's closures affect the request", async () => {
      const [room] = await seedResources(1);
      await closureRepo.save(
        new ScheduleClosureBuilder()
          .withTenantId(OTHER_TENANT)
          .withDate(occurrenceLocalDate(1))
          .build(),
      );

      expect(await conflictsOf(buildParams(buildService('CUSTOMER_CHOICE'), 3, [room.id]))).toEqual(
        [],
      );
    });

    it('merges an hours refusal and an occupancy refusal into one list ordered by occurrenceStart', async () => {
      const [room] = await seedResources(1);
      await closeFullDay(4);
      occupy(room, occurrenceStart(2));

      const conflicts = await conflictsOf(
        buildParams(buildService('CUSTOMER_CHOICE'), 6, [room.id]),
      );

      expect(conflicts).toEqual([
        { occurrenceStart: occurrenceStart(2), reason: 'OCCUPIED' },
        { occurrenceStart: occurrenceStart(4), reason: 'CLOSED' },
      ]);
    });

    it('reports one entry per occurrence, with the hours reason winning over occupancy', async () => {
      const [room] = await seedResources(1);
      await closeFullDay(2);
      occupy(room, occurrenceStart(2));

      const conflicts = await conflictsOf(
        buildParams(buildService('CUSTOMER_CHOICE'), 4, [room.id]),
      );

      expect(conflicts).toEqual([{ occurrenceStart: occurrenceStart(2), reason: 'CLOSED' }]);
    });

    describe('per assignment policy', () => {
      it('AUTO_ANY accepts an occurrence while one eligible resource is open', async () => {
        const [roomA] = await seedResources(2);
        await closeFullDay(1, roomA);

        expect(await conflictsOf(buildParams(buildService('AUTO_ANY'), 3))).toEqual([]);
      });

      it('AUTO_ANY refuses an occurrence when every eligible resource is closed', async () => {
        const rooms = await seedResources(2);
        for (const room of rooms) await closeFullDay(1, room);

        expect(await conflictsOf(buildParams(buildService('AUTO_ANY'), 3))).toEqual([
          { occurrenceStart: occurrenceStart(1), reason: 'CLOSED' },
        ]);
      });

      it('AUTO_FUNGIBLE_POOL considers only the first eligible resource', async () => {
        await seedResources(2);
        const [first, second] = await resourceRepo.findByTenant(TENANT, {
          type: ResourceType.ROOM,
          isActive: true,
        });
        await closeFullDay(1, second);
        expect(await conflictsOf(buildParams(buildService('AUTO_FUNGIBLE_POOL'), 3))).toEqual([]);

        await closeFullDay(1, first);
        expect(await conflictsOf(buildParams(buildService('AUTO_FUNGIBLE_POOL'), 3))).toHaveLength(
          1,
        );
      });
    });

    describe('the trailing gap', () => {
      // Occurrences run 10:00-11:00; the business closes at 11:00 on Tuesdays.
      const closesAtEleven = { open: '09:00', close: '11:00' };

      it('accepts an occurrence whose trailing gap ends exactly at closing', async () => {
        const [room] = await seedResources(1, 0);
        const params = withHours(
          buildParams(buildService('CUSTOMER_CHOICE', 0), 2, [room.id]),
          closesAtEleven,
        );

        expect(await conflictsOf(params)).toEqual([]);
      });

      it('refuses an occurrence whose service buffer runs past closing', async () => {
        const [room] = await seedResources(1, 0);
        const params = withHours(
          buildParams(buildService('CUSTOMER_CHOICE', 15), 2, [room.id]),
          closesAtEleven,
        );

        expect((await conflictsOf(params)).map((c) => c.reason)).toEqual([
          'OUTSIDE_HOURS',
          'OUTSIDE_HOURS',
        ]);
      });

      it("refuses an occurrence whose resource's turnover runs past closing", async () => {
        const [room] = await seedResources(1, 20);
        const params = withHours(
          buildParams(buildService('CUSTOMER_CHOICE', null), 2, [room.id]),
          closesAtEleven,
        );

        expect(await conflictsOf(params)).toHaveLength(2);
      });
    });

    describe('timezone', () => {
      it('evaluates an occurrence on its tenant-local date, not the UTC date', async () => {
        const [room] = await seedResources(1);
        // 22:00 in Sao Paulo is 01:00 UTC on the NEXT calendar day. The closure is on the
        // tenant-local date, so it must still catch the occurrence.
        const start = new Date('2031-03-05T01:00:00.000Z');
        const params: ConflictCheckParams = {
          ...buildParams(buildService('CUSTOMER_CHOICE'), 1, [room.id]),
          businessHours: { ...BUSINESS_HOURS, tuesday: { open: '09:00', close: '23:59' } },
          occurrences: [{ occurrenceStart: start, occurrenceStartLocalDate: '2031-03-04' }],
        };
        await closeFullDay(0);

        expect(await conflictsOf(params)).toEqual([{ occurrenceStart: start, reason: 'CLOSED' }]);
      });
    });

    describe('a constant number of queries', () => {
      const expectedCounts = {
        closureRange: 1,
        closureResources: 1,
        openingRange: 1,
        openingResources: 1,
      };

      function queryCounts() {
        return {
          closureRange: closureRepo.rangeQueryCount,
          closureResources: closureRepo.resourcesRangeQueryCount,
          openingRange: openingRepo.rangeQueryCount,
          openingResources: openingRepo.resourcesRangeQueryCount,
        };
      }

      it.each([3, 90])('loads closures and openings once each for %i occurrences', async (n) => {
        await seedResources(1);
        await assertPatternConflictFree(deps, buildParams(buildService('AUTO_FUNGIBLE_POOL'), n));

        expect(queryCounts()).toEqual(expectedCounts);
      });

      it.each([1, 5])('loads them once each for %i considered resources', async (n) => {
        await seedResources(n);
        await assertPatternConflictFree(deps, buildParams(buildService('AUTO_ANY'), 20));

        expect(queryCounts()).toEqual(expectedCounts);
      });
    });

    // The batched verdicts must equal AvailabilityService.isWindowFree() evaluated one occurrence
    // at a time over the same windows — creation and availability apply one rule.
    describe('parity with isWindowFree()', () => {
      it('agrees occurrence by occurrence over closures and partial closures', async () => {
        const [room] = await seedResources(1, 10);
        const fullDay = new ScheduleClosureBuilder()
          .withTenantId(TENANT)
          .withDate(occurrenceLocalDate(1))
          .build();
        const partial = new ScheduleClosureBuilder()
          .withTenantId(TENANT)
          .withDate(occurrenceLocalDate(3))
          .withStartTime('10:30')
          .withEndTime('11:30')
          .build();
        await closureRepo.save(fullDay);
        await closureRepo.save(partial);
        const params = buildParams(buildService('CUSTOMER_CHOICE', 15), 6, [room.id]);
        const availability = new AvailabilityService();
        const gap = availability.effectiveFlatGapMinutes(15, room.turnoverMinutes);

        const expectedRefused = params.occurrences
          .filter(({ occurrenceStart: start, occurrenceStartLocalDate: date }) => {
            const closures = [fullDay, partial].filter((c) => c.date.value === date);
            return !availability.isWindowFree(
              date,
              BUSINESS_HOURS,
              { resource: room, closures, opening: null, resourceOpening: null },
              { start, end: new Date(start.getTime() + (DURATION_MINUTES + gap) * 60_000) },
              [],
            );
          })
          .map(({ occurrenceStart: start }) => start);

        const conflicts = await conflictsOf(params);

        expect(conflicts.map((c) => c.occurrenceStart)).toEqual(expectedRefused);
        expect(expectedRefused).toHaveLength(2);
      });
    });
  });
});
