import type { BusinessHours } from '../../../../shared/value-objects/business-hours.vo';
import {
  ResourceBuilder,
  ScheduleClosureBuilder,
  ScheduleOpeningBuilder,
} from '../../../../test/builders/booking/index';
import { InMemoryScheduleClosureRepository } from '../../../../test/repositories/booking/in-memory-schedule-closure.repository';
import { InMemoryScheduleOpeningRepository } from '../../../../test/repositories/booking/in-memory-schedule-opening.repository';
import { RecurrenceOccurrence } from '../../domain/recurrence-rule.helpers';
import { AvailabilityService } from '../../domain/services/availability.service';
import {
  findHoursConflicts,
  HoursCheckInput,
  loadHoursScheduleData,
} from './recurring-booking-schedule-hours.helpers';

const TENANT = '10000000-0000-4000-8000-000000000500';
const OTHER_TENANT = '10000000-0000-4000-8000-000000000501';

const BUSINESS_HOURS: BusinessHours = {
  timezone: 'America/Sao_Paulo',
  monday: { open: '09:00', close: '18:00' },
  tuesday: { open: '09:00', close: '18:00' },
  wednesday: { open: '09:00', close: '18:00' },
  thursday: { open: '09:00', close: '18:00' },
  friday: { open: '09:00', close: '18:00' },
  saturday: null,
  sunday: null,
};

// Tuesdays 10:00 local (13:00Z).
const OCCURRENCES: RecurrenceOccurrence[] = [
  { occurrenceStart: new Date('2031-03-04T13:00:00.000Z'), occurrenceStartLocalDate: '2031-03-04' },
  { occurrenceStart: new Date('2031-03-11T13:00:00.000Z'), occurrenceStartLocalDate: '2031-03-11' },
];

describe('findHoursConflicts', () => {
  const room = new ResourceBuilder().withTenantId(TENANT).build();

  function input(overrides: Partial<HoursCheckInput> = {}): HoursCheckInput {
    return {
      availabilityService: new AvailabilityService(),
      businessHours: BUSINESS_HOURS,
      schedule: { closures: [], tenantOpenings: [], resourceOpenings: [] },
      resources: [room],
      anyOpenResourceSuffices: false,
      occurrences: OCCURRENCES,
      durationMinutes: 60,
      bufferAfterMinutes: 0,
      ...overrides,
    };
  }

  // The approval step (M23-S05) calls the pass with plain data, without the request context.
  it('takes plain data only — no repositories, no request context', () => {
    expect(findHoursConflicts(input())).toEqual([]);
  });

  it('flags a full-day closure as CLOSED', () => {
    const closure = new ScheduleClosureBuilder()
      .withTenantId(TENANT)
      .withDate('2031-03-11')
      .build();

    expect(
      findHoursConflicts(
        input({ schedule: { closures: [closure], tenantOpenings: [], resourceOpenings: [] } }),
      ),
    ).toEqual([{ occurrenceStart: OCCURRENCES[1].occurrenceStart, reason: 'CLOSED' }]);
  });

  it('flags a partial closure that overlaps the window, not one that only follows it', () => {
    const overlapping = new ScheduleClosureBuilder()
      .withTenantId(TENANT)
      .withDate('2031-03-04')
      .withStartTime('10:30')
      .withEndTime('12:00')
      .build();
    const following = new ScheduleClosureBuilder()
      .withTenantId(TENANT)
      .withDate('2031-03-11')
      .withStartTime('11:00')
      .withEndTime('12:00')
      .build();

    expect(
      findHoursConflicts(
        input({
          schedule: {
            closures: [overlapping, following],
            tenantOpenings: [],
            resourceOpenings: [],
          },
        }),
      ),
    ).toEqual([{ occurrenceStart: OCCURRENCES[0].occurrenceStart, reason: 'CLOSED' }]);
  });

  it('flags an occurrence outside business hours as OUTSIDE_HOURS', () => {
    const earlyOccurrence: RecurrenceOccurrence = {
      occurrenceStart: new Date('2031-03-04T10:00:00.000Z'), // 07:00 local
      occurrenceStartLocalDate: '2031-03-04',
    };

    expect(findHoursConflicts(input({ occurrences: [earlyOccurrence] }))).toEqual([
      { occurrenceStart: earlyOccurrence.occurrenceStart, reason: 'OUTSIDE_HOURS' },
    ]);
  });

  it('accepts a normally-closed day that a tenant-wide opening makes open', () => {
    const saturday: RecurrenceOccurrence = {
      occurrenceStart: new Date('2031-03-08T13:00:00.000Z'),
      occurrenceStartLocalDate: '2031-03-08',
    };
    const opening = new ScheduleOpeningBuilder()
      .withTenantId(TENANT)
      .withDate('2031-03-08')
      .withStartTime('09:00')
      .withEndTime('14:00')
      .build();

    expect(findHoursConflicts(input({ occurrences: [saturday] }))[0]?.reason).toBe('CLOSED');
    expect(
      findHoursConflicts(
        input({
          occurrences: [saturday],
          schedule: { closures: [], tenantOpenings: [opening], resourceOpenings: [] },
        }),
      ),
    ).toEqual([]);
  });

  it('returns conflicts ordered by occurrenceStart regardless of input order', () => {
    const closures = OCCURRENCES.map((o) =>
      new ScheduleClosureBuilder()
        .withTenantId(TENANT)
        .withDate(o.occurrenceStartLocalDate)
        .build(),
    );

    const conflicts = findHoursConflicts(
      input({
        occurrences: [...OCCURRENCES].reverse(),
        schedule: { closures, tenantOpenings: [], resourceOpenings: [] },
      }),
    );

    expect(conflicts.map((c) => c.occurrenceStart)).toEqual(
      OCCURRENCES.map((o) => o.occurrenceStart),
    );
  });

  it('with anyOpenResourceSuffices, one open resource is enough', () => {
    const otherRoom = new ResourceBuilder().withTenantId(TENANT).build();
    const closedRoomClosure = new ScheduleClosureBuilder()
      .withTenantId(TENANT)
      .withResourceId(room.id)
      .withDate('2031-03-04')
      .build();
    const schedule = { closures: [closedRoomClosure], tenantOpenings: [], resourceOpenings: [] };

    expect(
      findHoursConflicts(
        input({ resources: [room, otherRoom], anyOpenResourceSuffices: true, schedule }),
      ),
    ).toEqual([]);
    expect(
      findHoursConflicts(
        input({ resources: [room, otherRoom], anyOpenResourceSuffices: false, schedule }),
      ),
    ).toHaveLength(1);
  });
});

describe('findHoursConflicts — resource-scoped openings', () => {
  // A resource with no working hours on Tuesdays, inside a tenant that is open on Tuesdays.
  const closedTuesdays = new ResourceBuilder()
    .withTenantId(TENANT)
    .withWorkingHours({ ...BUSINESS_HOURS, tuesday: null })
    .build();
  const otherRoom = new ResourceBuilder().withTenantId(TENANT).build();

  function check(overrides: Partial<HoursCheckInput>) {
    return findHoursConflicts({
      availabilityService: new AvailabilityService(),
      businessHours: BUSINESS_HOURS,
      schedule: { closures: [], tenantOpenings: [], resourceOpenings: [] },
      resources: [closedTuesdays],
      anyOpenResourceSuffices: false,
      occurrences: [OCCURRENCES[0]],
      durationMinutes: 60,
      bufferAfterMinutes: 0,
      ...overrides,
    });
  }

  const openingFor = (resourceId: string) =>
    new ScheduleOpeningBuilder()
      .withTenantId(TENANT)
      .withResourceId(resourceId)
      .withDate('2031-03-04')
      .withStartTime('09:00')
      .withEndTime('14:00')
      .build();

  it('a day the resource does not work is CLOSED without an opening', () => {
    expect(check({})).toEqual([
      { occurrenceStart: OCCURRENCES[0].occurrenceStart, reason: 'CLOSED' },
    ]);
  });

  it("a resource-scoped opening makes that resource's closed day open", () => {
    const schedule = {
      closures: [],
      tenantOpenings: [],
      resourceOpenings: [openingFor(closedTuesdays.id)],
    };

    expect(check({ schedule })).toEqual([]);
  });

  it("another resource's opening does not open this resource's day", () => {
    const schedule = {
      closures: [],
      tenantOpenings: [],
      resourceOpenings: [openingFor(otherRoom.id)],
    };

    expect(check({ schedule })).toHaveLength(1);
  });

  it('an opening never bypasses a tenant-wide closure (the tenant window is the outer bound)', () => {
    const tenantClosure = new ScheduleClosureBuilder()
      .withTenantId(TENANT)
      .withDate('2031-03-04')
      .build();
    const schedule = {
      closures: [tenantClosure],
      tenantOpenings: [],
      resourceOpenings: [openingFor(closedTuesdays.id)],
    };

    expect(check({ schedule })).toEqual([
      { occurrenceStart: OCCURRENCES[0].occurrenceStart, reason: 'CLOSED' },
    ]);
  });
});

describe('findHoursConflicts — a tenant in a timezone with DST', () => {
  const newYork: BusinessHours = {
    timezone: 'America/New_York',
    monday: { open: '09:00', close: '18:00' },
    tuesday: { open: '09:00', close: '18:00' },
    wednesday: { open: '09:00', close: '18:00' },
    thursday: { open: '09:00', close: '18:00' },
    friday: { open: '09:00', close: '18:00' },
    saturday: { open: '09:00', close: '18:00' },
    sunday: null,
  };
  const room = new ResourceBuilder().withTenantId(TENANT).build();

  // US daylight time began on Sunday 2031-03-09. The same 13:30Z is 08:30 local on Saturday the
  // 8th (EST, UTC-5) but 09:30 local on Monday the 10th (EDT, UTC-4).
  const beforeDst: RecurrenceOccurrence = {
    occurrenceStart: new Date('2031-03-08T13:30:00.000Z'),
    occurrenceStartLocalDate: '2031-03-08',
  };
  const afterDst: RecurrenceOccurrence = {
    occurrenceStart: new Date('2031-03-10T13:30:00.000Z'),
    occurrenceStartLocalDate: '2031-03-10',
  };

  it('evaluates each occurrence at its own local time, either side of the clock change', () => {
    const conflicts = findHoursConflicts({
      availabilityService: new AvailabilityService(),
      businessHours: newYork,
      schedule: { closures: [], tenantOpenings: [], resourceOpenings: [] },
      resources: [room],
      anyOpenResourceSuffices: false,
      occurrences: [beforeDst, afterDst],
      durationMinutes: 60,
      bufferAfterMinutes: 0,
    });

    expect(conflicts).toEqual([
      { occurrenceStart: beforeDst.occurrenceStart, reason: 'OUTSIDE_HOURS' },
    ]);
  });
});

describe('loadHoursScheduleData', () => {
  it('loads tenant-wide and resource-scoped rows in four queries, scoped to the tenant', async () => {
    const closureRepo = new InMemoryScheduleClosureRepository();
    const openingRepo = new InMemoryScheduleOpeningRepository();
    const room = new ResourceBuilder().withTenantId(TENANT).build();
    await closureRepo.save(
      new ScheduleClosureBuilder().withTenantId(TENANT).withDate('2031-03-04').build(),
    );
    await closureRepo.save(
      new ScheduleClosureBuilder()
        .withTenantId(TENANT)
        .withResourceId(room.id)
        .withDate('2031-03-11')
        .build(),
    );
    await closureRepo.save(
      new ScheduleClosureBuilder().withTenantId(OTHER_TENANT).withDate('2031-03-04').build(),
    );
    await openingRepo.save(
      new ScheduleOpeningBuilder()
        .withTenantId(TENANT)
        .withResourceId(room.id)
        .withDate('2031-03-08')
        .build(),
    );

    const data = await loadHoursScheduleData(
      { closureRepo, openingRepo },
      TENANT,
      [room.id],
      '2031-03-01',
      '2031-03-31',
    );

    expect(data.closures.map((c) => c.date.value)).toEqual(['2031-03-04', '2031-03-11']);
    expect(data.tenantOpenings).toEqual([]);
    expect(data.resourceOpenings.map((o) => o.date.value)).toEqual(['2031-03-08']);
    expect(closureRepo.rangeQueryCount + closureRepo.resourcesRangeQueryCount).toBe(2);
    expect(openingRepo.rangeQueryCount + openingRepo.resourcesRangeQueryCount).toBe(2);
  });
});
