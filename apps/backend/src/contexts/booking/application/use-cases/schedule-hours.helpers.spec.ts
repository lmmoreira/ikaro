import { localDateTimeToUTCIso } from '../../../../shared/utils/calendar-date';
import {
  ResourceBuilder,
  ScheduleClosureBuilder,
  ScheduleOpeningBuilder,
} from '../../../../test/builders/booking/index';
import { InMemoryScheduleClosureRepository } from '../../../../test/repositories/booking/in-memory-schedule-closure.repository';
import { InMemoryScheduleOpeningRepository } from '../../../../test/repositories/booking/in-memory-schedule-opening.repository';
import { DEFAULT_TEST_BUSINESS_HOURS } from '../../../../test/utils/business-hours-fixtures';
import { ResourceType } from '../../domain/resource.types';
import { AvailabilityService } from '../../domain/services/availability.service';
import {
  buildHoursDayLookup,
  HoursScheduleData,
  loadHoursScheduleData,
  resourceWindowHoursVerdict,
} from './schedule-hours.helpers';

const TENANT = '10000000-0000-4000-8000-000000000500';
const OTHER_TENANT = '10000000-0000-4000-8000-000000000501';
const TIMEZONE = 'America/Sao_Paulo';
const TUESDAY = '2031-03-04';
const SUNDAY = '2031-03-02';

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

describe('resourceWindowHoursVerdict', () => {
  const availabilityService = new AvailabilityService();
  const location = new ResourceBuilder()
    .withTenantId(TENANT)
    .withType(ResourceType.LOCATION)
    .build();

  function verdict(schedule: Partial<HoursScheduleData>, date: string, from: string, to: string) {
    return resourceWindowHoursVerdict({
      availabilityService,
      businessHours: DEFAULT_TEST_BUSINESS_HOURS,
      lookup: buildHoursDayLookup({
        closures: [],
        tenantOpenings: [],
        resourceOpenings: [],
        ...schedule,
      }),
      resource: location,
      window: {
        start: new Date(localDateTimeToUTCIso(date, from, TIMEZONE)),
        end: new Date(localDateTimeToUTCIso(date, to, TIMEZONE)),
      },
    });
  }

  it('is FREE inside the open hours', () => {
    expect(verdict({}, TUESDAY, '10:00', '10:30')).toBe('FREE');
  });

  it('is CLOSED on a normally-closed weekday', () => {
    expect(verdict({}, SUNDAY, '10:00', '10:30')).toBe('CLOSED');
  });

  it('is CLOSED for a full-day closure', () => {
    const closure = new ScheduleClosureBuilder().withTenantId(TENANT).withDate(TUESDAY).build();
    expect(verdict({ closures: [closure] }, TUESDAY, '10:00', '10:30')).toBe('CLOSED');
  });

  it('is OUTSIDE_HOURS when the day is open but the window is not', () => {
    expect(verdict({}, TUESDAY, '17:45', '18:15')).toBe('OUTSIDE_HOURS');
    expect(verdict({}, TUESDAY, '07:00', '07:30')).toBe('OUTSIDE_HOURS');
  });

  it("derives the day from the window's start in the tenant timezone, not UTC", () => {
    // 22:00 local on Monday is already Tuesday in UTC; it must be judged as Monday evening.
    const closure = new ScheduleClosureBuilder().withTenantId(TENANT).withDate(TUESDAY).build();
    expect(verdict({ closures: [closure] }, '2031-03-03', '22:00', '22:30')).toBe('OUTSIDE_HOURS');
  });

  it('ignores a closure scoped to another resource', () => {
    const other = new ResourceBuilder().withTenantId(TENANT).build();
    const closure = new ScheduleClosureBuilder()
      .withTenantId(TENANT)
      .withResourceId(other.id)
      .withDate(TUESDAY)
      .build();
    expect(verdict({ closures: [closure] }, TUESDAY, '10:00', '10:30')).toBe('FREE');
  });

  // The write path and the availability read must never disagree: a start the read lists is
  // accepted, and one it omits is refused.
  describe('parity with the availability read', () => {
    const scenarios: [string, string, Partial<HoursScheduleData>][] = [
      ['an ordinary weekday', TUESDAY, {}],
      ['a normally-closed Sunday', SUNDAY, {}],
      [
        'a full-day closure',
        TUESDAY,
        { closures: [new ScheduleClosureBuilder().withTenantId(TENANT).withDate(TUESDAY).build()] },
      ],
      [
        'a partial closure',
        TUESDAY,
        {
          closures: [
            new ScheduleClosureBuilder()
              .withTenantId(TENANT)
              .withDate(TUESDAY)
              .withStartTime('10:00')
              .withEndTime('12:00')
              .build(),
          ],
        },
      ],
      [
        'an opening on a closed Sunday',
        SUNDAY,
        {
          tenantOpenings: [
            new ScheduleOpeningBuilder()
              .withTenantId(TENANT)
              .withDate(SUNDAY)
              .withStartTime('09:00')
              .withEndTime('12:00')
              .build(),
          ],
        },
      ],
      [
        'an opening that extends a weekday',
        TUESDAY,
        {
          tenantOpenings: [
            new ScheduleOpeningBuilder()
              .withTenantId(TENANT)
              .withDate(TUESDAY)
              .withStartTime('07:00')
              .withEndTime('20:00')
              .build(),
          ],
        },
      ],
    ];

    it.each(scenarios)('lists exactly the starts it accepts: %s', (_label, date, schedule) => {
      const bufferAfterMinutes = 30;
      const listed = new Set(
        availabilityService
          .calculate({
            date,
            services: [{ durationMinutes: 30 }],
            businessHours: DEFAULT_TEST_BUSINESS_HOURS,
            slotGranularityMinutes: 30,
            serviceBufferMinutes: bufferAfterMinutes,
            closures: schedule.closures ?? [],
            opening: schedule.tenantOpenings?.[0] ?? null,
            existingOccupancy: [],
          })
          .map((slot) => slot.startsAt),
      );

      for (let minutes = 6 * 60; minutes <= 21 * 60; minutes += 30) {
        const hhmm = `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
        const start = new Date(localDateTimeToUTCIso(date, hhmm, TIMEZONE));
        const end = new Date(start.getTime() + (30 + bufferAfterMinutes) * 60_000);
        const accepted =
          resourceWindowHoursVerdict({
            availabilityService,
            businessHours: DEFAULT_TEST_BUSINESS_HOURS,
            lookup: buildHoursDayLookup({
              closures: [],
              tenantOpenings: [],
              resourceOpenings: [],
              ...schedule,
            }),
            resource: location,
            window: { start, end },
          }) === 'FREE';

        expect([hhmm, accepted]).toEqual([hhmm, listed.has(start.toISOString())]);
      }
    });
  });
});
