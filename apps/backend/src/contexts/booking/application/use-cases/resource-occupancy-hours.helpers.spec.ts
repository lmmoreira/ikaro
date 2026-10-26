import { localDateTimeToUTCIso } from '../../../../shared/utils/calendar-date';
import { ServiceBuilder } from '../../../../test/builders/booking/index';
import { ResourceBuilder } from '../../../../test/builders/booking/resource.builder';
import { ScheduleClosureBuilder } from '../../../../test/builders/booking/schedule-closure.builder';
import { ScheduleOpeningBuilder } from '../../../../test/builders/booking/schedule-opening.builder';
import { InMemoryTenantLock } from '../../../../test/infrastructure/in-memory-tenant-lock';
import { InMemoryResourceOccupancyRepository } from '../../../../test/repositories/booking/in-memory-resource-occupancy.repository';
import { InMemoryResourceRepository } from '../../../../test/repositories/booking/in-memory-resource.repository';
import { InMemoryScheduleClosureRepository } from '../../../../test/repositories/booking/in-memory-schedule-closure.repository';
import { InMemoryScheduleOpeningRepository } from '../../../../test/repositories/booking/in-memory-schedule-opening.repository';
import { DEFAULT_TEST_BUSINESS_HOURS } from '../../../../test/utils/business-hours-fixtures';
import {
  BookingOutsideBusinessHoursError,
  BookingSlotClosedError,
} from '../../domain/errors/booking-domain.error';
import { Resource } from '../../domain/resource.aggregate';
import { ResourceRequirement } from '../../domain/resource-requirement';
import { ResourceType, ResourceWorkingHours } from '../../domain/resource.types';
import { AvailabilityService } from '../../domain/services/availability.service';
import { Service } from '../../domain/service.aggregate';
import { ServiceLeg } from '../../domain/service-leg';
import { resolveBookingLinesResourceCandidates } from './resource-occupancy.helpers';

const TENANT_ID = '00000000-0000-7000-8000-000000000001';
const OTHER_TENANT_ID = '00000000-0000-7000-8000-000000000099';
const TIMEZONE = 'America/Sao_Paulo';
// 2031-03-04 is a Tuesday, 2031-03-02 a Sunday; America/Sao_Paulo is UTC-3.
const TUESDAY = '2031-03-04';
const SUNDAY = '2031-03-02';

// A start at the given tenant-local wall-clock time.
function local(date: string, hhmm: string): Date {
  return new Date(localDateTimeToUTCIso(date, hhmm, TIMEZONE));
}

function weekdayHours(open: string, close: string): ResourceWorkingHours {
  const day = { open, close };
  return {
    monday: day,
    tuesday: day,
    wednesday: day,
    thursday: day,
    friday: day,
    saturday: null,
    sunday: null,
  };
}

describe('resolveBookingLinesResourceCandidates — working hours, closures and openings (TD50)', () => {
  let resourceRepo: InMemoryResourceRepository;
  let occupancyRepo: InMemoryResourceOccupancyRepository;
  let closureRepo: InMemoryScheduleClosureRepository;
  let openingRepo: InMemoryScheduleOpeningRepository;
  let tenantLock: InMemoryTenantLock;

  beforeEach(async () => {
    resourceRepo = new InMemoryResourceRepository();
    occupancyRepo = new InMemoryResourceOccupancyRepository();
    closureRepo = new InMemoryScheduleClosureRepository();
    openingRepo = new InMemoryScheduleOpeningRepository();
    tenantLock = new InMemoryTenantLock();
    await resourceRepo.save(
      new ResourceBuilder().withTenantId(TENANT_ID).withType(ResourceType.LOCATION).build(),
    );
  });

  async function room(name: string, workingHours?: ResourceWorkingHours): Promise<Resource> {
    const builder = new ResourceBuilder()
      .withTenantId(TENANT_ID)
      .withType(ResourceType.ROOM)
      .withName(name);
    const resource = (workingHours ? builder.withWorkingHours(workingHours) : builder).build();
    await resourceRepo.save(resource);
    return resource;
  }

  function resolve(
    lines: { lineId: string; serviceId: string; durationMinsAtBooking: number }[],
    serviceMap: Map<string, Service>,
    scheduledAt: Date,
    options: {
      selections?: { serviceId: string; resourceType: ResourceType; resourceId: string }[];
      withHours?: boolean;
    } = {},
  ) {
    const { selections = [], withHours = true } = options;
    return resolveBookingLinesResourceCandidates({
      resourceRepo,
      availabilityService: new AvailabilityService(),
      occupancyRepo,
      tenantId: TENANT_ID,
      scheduledAt,
      timezone: TIMEZONE,
      lines,
      serviceMap,
      resourceSelections: selections.map((s) => ({ ...s, legIndex: null })),
      lockResources: (ids) => tenantLock.lockResources(TENANT_ID, ids),
      hoursSource: withHours
        ? {
            repos: { closureRepo, openingRepo },
            businessHours: DEFAULT_TEST_BUSINESS_HOURS,
          }
        : undefined,
    });
  }

  function degenerateService(durationMinutes = 30, bufferAfterMinutes: number | null = null) {
    return new ServiceBuilder()
      .withId('service-1')
      .withTenantId(TENANT_ID)
      .withDurationMinutes(durationMinutes)
      .withBufferAfterMinutes(bufferAfterMinutes)
      .withResourceRequirements([])
      .build();
  }

  function oneLine(service: Service, scheduledAt: Date, durationMinsAtBooking = 30) {
    return resolve(
      [{ lineId: 'line-1', serviceId: service.id, durationMinsAtBooking }],
      new Map([[service.id, service]]),
      scheduledAt,
    );
  }

  describe('the tenant is the only scope (a service with no requirements books the LOCATION)', () => {
    it('accepts a start inside the open hours', async () => {
      await expect(oneLine(degenerateService(), local(TUESDAY, '10:00'))).resolves.toBeDefined();
    });

    it('refuses a normally-closed weekday as closed', async () => {
      await expect(oneLine(degenerateService(), local(SUNDAY, '10:00'))).rejects.toBeInstanceOf(
        BookingSlotClosedError,
      );
    });

    it.each([
      ['before opening', '06:00'],
      ['after closing', '20:00'],
      ['starting inside but ending after closing', '17:45'],
    ])('refuses a start %s as outside business hours', async (_label, hhmm) => {
      await expect(oneLine(degenerateService(), local(TUESDAY, hhmm))).rejects.toBeInstanceOf(
        BookingOutsideBusinessHoursError,
      );
    });

    it("counts the service's trailing buffer: a slot whose buffer runs past closing is refused", async () => {
      const service = degenerateService(30, 60);
      await expect(oneLine(service, local(TUESDAY, '17:00'))).rejects.toBeInstanceOf(
        BookingOutsideBusinessHoursError,
      );
      await expect(oneLine(service, local(TUESDAY, '16:30'))).resolves.toBeDefined();
    });

    it('refuses a full-day closure as closed', async () => {
      await closureRepo.save(
        new ScheduleClosureBuilder().withTenantId(TENANT_ID).withDate(TUESDAY).build(),
      );
      await expect(oneLine(degenerateService(), local(TUESDAY, '10:00'))).rejects.toBeInstanceOf(
        BookingSlotClosedError,
      );
    });

    it('refuses a start inside a partial closure but accepts one outside it', async () => {
      await closureRepo.save(
        new ScheduleClosureBuilder()
          .withTenantId(TENANT_ID)
          .withDate(TUESDAY)
          .withStartTime('10:00')
          .withEndTime('12:00')
          .build(),
      );
      await expect(oneLine(degenerateService(), local(TUESDAY, '10:30'))).rejects.toBeInstanceOf(
        BookingSlotClosedError,
      );
      await expect(oneLine(degenerateService(), local(TUESDAY, '14:00'))).resolves.toBeDefined();
    });

    it('lets an opening on a normally-closed day in, and refuses a start outside the opening', async () => {
      await openingRepo.save(
        new ScheduleOpeningBuilder()
          .withTenantId(TENANT_ID)
          .withDate(SUNDAY)
          .withStartTime('09:00')
          .withEndTime('12:00')
          .build(),
      );
      await expect(oneLine(degenerateService(), local(SUNDAY, '10:00'))).resolves.toBeDefined();
      await expect(oneLine(degenerateService(), local(SUNDAY, '15:00'))).rejects.toBeInstanceOf(
        BookingOutsideBusinessHoursError,
      );
    });

    it("ignores another tenant's closure on the same date", async () => {
      await closureRepo.save(
        new ScheduleClosureBuilder().withTenantId(OTHER_TENANT_ID).withDate(TUESDAY).build(),
      );
      await expect(oneLine(degenerateService(), local(TUESDAY, '10:00'))).resolves.toBeDefined();
    });

    it('applies nothing when no hours source is given', async () => {
      await expect(
        resolve(
          [{ lineId: 'line-1', serviceId: 'service-1', durationMinsAtBooking: 30 }],
          new Map([['service-1', degenerateService()]]),
          local(SUNDAY, '06:00'),
          { withHours: false },
        ),
      ).resolves.toBeDefined();
    });
  });

  describe('automatic selection prefers a resource that is open', () => {
    const requirement = (selectionMode: 'AUTO_ANY' | 'AUTO_FUNGIBLE_POOL') =>
      ResourceRequirement.create({ type: ResourceType.ROOM, selectionMode });

    function roomService(selectionMode: 'AUTO_ANY' | 'AUTO_FUNGIBLE_POOL') {
      return new ServiceBuilder()
        .withId('service-1')
        .withTenantId(TENANT_ID)
        .withDurationMinutes(30)
        .withResourceRequirements([requirement(selectionMode)])
        .build();
    }

    async function chosenResourceId(
      selectionMode: 'AUTO_ANY' | 'AUTO_FUNGIBLE_POOL',
      scheduledAt: Date,
      withHours = true,
    ): Promise<string> {
      const service = roomService(selectionMode);
      const result = await resolve(
        [{ lineId: 'line-1', serviceId: service.id, durationMinsAtBooking: 30 }],
        new Map([[service.id, service]]),
        scheduledAt,
        { withHours },
      );
      return result.get('line-1')!.candidates[0].resourceId;
    }

    it.each(['AUTO_ANY', 'AUTO_FUNGIBLE_POOL'] as const)(
      '%s skips the first-by-id room when it is outside its own hours and takes the open one',
      async (selectionMode) => {
        const morning = await room('Morning room', weekdayHours('09:00', '12:00'));
        const afternoon = await room('Afternoon room', weekdayHours('13:00', '18:00'));
        // Ids created in one millisecond are not ordered, so pick the time at which the room with
        // the lower id (the one an unfiltered pick takes) is the closed one.
        const lowestIsMorning = morning.id.localeCompare(afternoon.id) < 0;
        const at = local(TUESDAY, lowestIsMorning ? '15:00' : '10:00');
        const [closed, open] = lowestIsMorning ? [morning, afternoon] : [afternoon, morning];

        await expect(chosenResourceId(selectionMode, at, false)).resolves.toBe(closed.id);
        await expect(chosenResourceId(selectionMode, at)).resolves.toBe(open.id);
      },
    );

    it('skips a room closed by a resource-scoped closure', async () => {
      const closed = await room('Closed room');
      const open = await room('Open room');
      await closureRepo.save(
        new ScheduleClosureBuilder()
          .withTenantId(TENANT_ID)
          .withResourceId(closed.id)
          .withDate(TUESDAY)
          .build(),
      );

      await expect(chosenResourceId('AUTO_ANY', local(TUESDAY, '10:00'))).resolves.toBe(open.id);
    });

    it('refuses with the hours reason when every room is closed (not a missing resource)', async () => {
      const first = await room('First room');
      const second = await room('Second room');
      for (const resource of [first, second]) {
        await closureRepo.save(
          new ScheduleClosureBuilder()
            .withTenantId(TENANT_ID)
            .withResourceId(resource.id)
            .withDate(TUESDAY)
            .build(),
        );
      }

      await expect(chosenResourceId('AUTO_ANY', local(TUESDAY, '10:00'))).rejects.toBeInstanceOf(
        BookingSlotClosedError,
      );
    });

    it('keeps an open but busy room as the pick so the refusal is "taken", not "closed"', async () => {
      const closed = await room('Closed room');
      const busy = await room('Busy room');
      await closureRepo.save(
        new ScheduleClosureBuilder()
          .withTenantId(TENANT_ID)
          .withResourceId(closed.id)
          .withDate(TUESDAY)
          .build(),
      );
      const start = local(TUESDAY, '10:00');
      occupancyRepo.seed(TENANT_ID, 'other-line', {
        resourceId: busy.id,
        resourceType: ResourceType.ROOM,
        resourceName: busy.name,
        legIndex: null,
        quantityPosition: null,
        selectionMode: 'AUTO_ANY',
        isBundleMember: false,
        gapMinutes: null,
        gapSource: null,
        startsAt: start,
        endsAt: new Date(start.getTime() + 30 * 60_000),
      });

      await expect(chosenResourceId('AUTO_ANY', start)).resolves.toBe(busy.id);
    });
  });

  describe('a pick or a bundle is verified, not re-chosen', () => {
    it('refuses a customer-chosen room that is closed', async () => {
      const chosen = await room('Chosen room');
      await closureRepo.save(
        new ScheduleClosureBuilder()
          .withTenantId(TENANT_ID)
          .withResourceId(chosen.id)
          .withDate(TUESDAY)
          .build(),
      );
      const service = new ServiceBuilder()
        .withId('service-1')
        .withTenantId(TENANT_ID)
        .withDurationMinutes(30)
        .withResourceRequirements([
          ResourceRequirement.create({
            type: ResourceType.ROOM,
            selectionMode: 'CUSTOMER_CHOICE',
          }),
        ])
        .build();

      await expect(
        resolve(
          [{ lineId: 'line-1', serviceId: service.id, durationMinsAtBooking: 30 }],
          new Map([[service.id, service]]),
          local(TUESDAY, '10:00'),
          {
            selections: [
              { serviceId: service.id, resourceType: ResourceType.ROOM, resourceId: chosen.id },
            ],
          },
        ),
      ).rejects.toBeInstanceOf(BookingSlotClosedError);
    });

    it('refuses a bundle when one requirement has no open resource', async () => {
      await room('Room');
      const equipment = new ResourceBuilder()
        .withTenantId(TENANT_ID)
        .withType(ResourceType.EQUIPMENT)
        .withName('Equipment')
        .build();
      await resourceRepo.save(equipment);
      await closureRepo.save(
        new ScheduleClosureBuilder()
          .withTenantId(TENANT_ID)
          .withResourceId(equipment.id)
          .withDate(TUESDAY)
          .build(),
      );
      const service = new ServiceBuilder()
        .withId('service-1')
        .withTenantId(TENANT_ID)
        .withDurationMinutes(30)
        .withResourceRequirements([
          ResourceRequirement.create({ type: ResourceType.ROOM, selectionMode: 'AUTO_ANY' }),
          ResourceRequirement.create({ type: ResourceType.EQUIPMENT, selectionMode: 'AUTO_ANY' }),
        ])
        .build();

      await expect(oneLine(service, local(TUESDAY, '10:00'))).rejects.toBeInstanceOf(
        BookingSlotClosedError,
      );
    });
  });

  describe('baskets and legged services are judged window by window', () => {
    it('refuses a two-line basket whose second line ends after closing', async () => {
      const service = degenerateService(30);
      const lines = [
        { lineId: 'line-1', serviceId: service.id, durationMinsAtBooking: 30 },
        { lineId: 'line-2', serviceId: service.id, durationMinsAtBooking: 60 },
      ];
      const map = new Map([[service.id, service]]);

      await expect(resolve(lines, map, local(TUESDAY, '17:00'))).rejects.toBeInstanceOf(
        BookingOutsideBusinessHoursError,
      );
      await expect(resolve(lines, map, local(TUESDAY, '15:00'))).resolves.toBeDefined();
    });

    it('refuses a legged service whose last leg runs past closing', async () => {
      await room('Room');
      const leg = (legIndex: number, durationMinutes: number) =>
        ServiceLeg.create({
          legIndex,
          name: `Etapa ${legIndex}`,
          durationMinutes,
          resourceRequirements: [
            ResourceRequirement.create({ type: ResourceType.ROOM, selectionMode: 'AUTO_ANY' }),
          ],
          transitionGapAfterMinutes: 0,
        });
      const service = new ServiceBuilder()
        .withId('service-1')
        .withTenantId(TENANT_ID)
        .withDurationMinutes(50)
        .withLegs([leg(0, 20), leg(1, 30)])
        .build();

      await expect(oneLine(service, local(TUESDAY, '17:40'), 50)).rejects.toBeInstanceOf(
        BookingOutsideBusinessHoursError,
      );
      await expect(oneLine(service, local(TUESDAY, '16:00'), 50)).resolves.toBeDefined();
    });
  });

  it('reads closures and openings in a fixed number of queries whatever the lines and resources', async () => {
    await room('Room 1');
    await room('Room 2');
    await room('Room 3');
    const service = new ServiceBuilder()
      .withId('service-1')
      .withTenantId(TENANT_ID)
      .withDurationMinutes(30)
      .withResourceRequirements([
        ResourceRequirement.create({ type: ResourceType.ROOM, selectionMode: 'AUTO_ANY' }),
      ])
      .build();
    const lines = [1, 2, 3].map((n) => ({
      lineId: `line-${n}`,
      serviceId: service.id,
      durationMinsAtBooking: 30,
    }));

    await resolve(lines, new Map([[service.id, service]]), local(TUESDAY, '10:00'));

    expect(closureRepo.rangeQueryCount + closureRepo.resourcesRangeQueryCount).toBe(2);
    expect(openingRepo.rangeQueryCount + openingRepo.resourcesRangeQueryCount).toBe(2);
  });
});
