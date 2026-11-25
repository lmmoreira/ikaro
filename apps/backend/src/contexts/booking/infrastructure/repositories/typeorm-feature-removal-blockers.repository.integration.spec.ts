import { DataSource } from 'typeorm';
import { uuidv7 } from '../../../../shared/domain/uuid-v7';
import { localDateStartUTC } from '../../../../shared/utils/calendar-date';
import {
  AvailabilityAlertEntityBuilder,
  BookingBuilder,
  RecurringBookingScheduleBuilder,
  ServiceEntityBuilder,
} from '../../../../test/builders/booking/index';
import { InMemoryEventBus } from '../../../../test/infrastructure/in-memory-event-bus';
import { InMemoryTenantSettingsPort } from '../../../../test/infrastructure/in-memory-tenant-settings.port';
import { createTestDataSource } from '../../../../test/test-datasource';
import { GetBookingFeatureRemovalImpactUseCase } from '../../application/use-cases/get-booking-feature-removal-impact.use-case';
import { TenantSettings } from '../../../platform/domain/value-objects/tenant-settings.vo';
import { BookingStatus } from '../../domain/booking.aggregate';
import { BookingAttendeeEntity } from '../entities/booking-attendee.entity';
import { BookingEntity } from '../entities/booking.entity';
import { BookingLineEntity } from '../entities/booking-line.entity';
import { BookingLineResourceAssignmentEntity } from '../entities/booking-line-resource-assignment.entity';
import { BookingStatusTransitionEntity } from '../entities/booking-status-transition.entity';
import { AvailabilityAlertEntity } from '../entities/availability-alert.entity';
import { RecurringBookingScheduleEntity } from '../entities/recurring-booking-schedule.entity';
import { RecurringBookingScheduleResourceAssignmentEntity } from '../entities/recurring-booking-schedule-resource-assignment.entity';
import { ServiceEntity } from '../entities/service.entity';
import {
  FEATURE_REMOVAL_BOOKING_BLOCKERS_SQL,
  FEATURE_REMOVAL_SCHEDULE_BLOCKERS_SQL,
  TypeOrmFeatureRemovalBlockersRepository,
} from './typeorm-feature-removal-blockers.repository';
import { TypeOrmBookingRepository } from './typeorm-booking.repository';
import { TypeOrmBookingStatusTransitionRepository } from './typeorm-booking-status-transition.repository';
import { TypeOrmRecurringBookingScheduleRepository } from './typeorm-recurring-booking-schedule.repository';

// M26-S18a: the two reads behind the BOOKING-removal guard, against real Postgres. Every id is
// generated per run, so a reused container never sees a row an earlier run left behind.
const TIMEZONE = 'America/Sao_Paulo';
const EFFECTIVE_DATE = '2026-12-15';
// 2026-12-15T03:00:00Z: the instant the effective day starts in São Paulo (UTC-3).
const BOUNDARY = localDateStartUTC(EFFECTIVE_DATE, TIMEZONE);
const MINUTE_MS = 60_000;
const DAY_MS = 24 * 60 * MINUTE_MS;
const APPROVER = uuidv7();

describe('TypeOrmFeatureRemovalBlockersRepository (integration)', () => {
  let dataSource: DataSource;
  let bookingRepo: TypeOrmBookingRepository;
  let scheduleRepo: TypeOrmRecurringBookingScheduleRepository;
  let blockersRepo: TypeOrmFeatureRemovalBlockersRepository;
  const tenantA = uuidv7();
  const tenantB = uuidv7();
  const serviceA = uuidv7();
  const serviceB = uuidv7();

  // A booking that ends `endsAtOffsetMs` from the boundary (negative = before it).
  const seedBooking = async (
    tenantId: string,
    endsAtOffsetMs: number,
    options: { status?: BookingStatus; scheduleId?: string | null } = {},
  ): Promise<string> => {
    const status = options.status ?? BookingStatus.APPROVED;
    const durationMins = 60;
    const endsAt = new Date(BOUNDARY.getTime() + endsAtOffsetMs);
    const builder = new BookingBuilder()
      .withTenantId(tenantId)
      .withCustomerId(uuidv7())
      .withStatus(status)
      .withScheduledAt(new Date(endsAt.getTime() - durationMins * MINUTE_MS))
      .withTotalDurationMins(durationMins)
      .withLines([]);
    if (options.scheduleId) builder.withRecurringScheduleId(options.scheduleId);
    if (status === BookingStatus.APPROVED) {
      builder.withApprovedAt(new Date()).withApprovedBy(APPROVER);
    }
    const booking = builder.build();
    await bookingRepo.save(booking);
    return booking.id;
  };

  const seedSchedule = async (
    tenantId: string,
    serviceId: string,
    endsOn: string,
    status: 'ACTIVE' | 'ENDED' | 'PENDING_APPROVAL' | 'CANCELLED' = 'ACTIVE',
  ): Promise<string> => {
    const schedule = new RecurringBookingScheduleBuilder()
      .withTenantId(tenantId)
      .withCustomerId(uuidv7())
      .withServiceId(serviceId)
      .withTerm('2026-11-01', endsOn)
      .withStatus(status)
      .build();
    await scheduleRepo.save(schedule);
    return schedule.id;
  };

  beforeAll(async () => {
    dataSource = await createTestDataSource();
    bookingRepo = new TypeOrmBookingRepository(
      dataSource.getRepository(BookingEntity),
      dataSource.getRepository(BookingLineEntity),
      dataSource.getRepository(BookingAttendeeEntity),
      dataSource.getRepository(BookingLineResourceAssignmentEntity),
      new InMemoryTenantSettingsPort(),
      new InMemoryEventBus(),
      new TypeOrmBookingStatusTransitionRepository(
        dataSource.getRepository(BookingStatusTransitionEntity),
      ),
    );
    scheduleRepo = new TypeOrmRecurringBookingScheduleRepository(
      dataSource.getRepository(RecurringBookingScheduleEntity),
      dataSource.getRepository(RecurringBookingScheduleResourceAssignmentEntity),
      new InMemoryEventBus(),
    );
    blockersRepo = new TypeOrmFeatureRemovalBlockersRepository(dataSource);
    await dataSource
      .getRepository(ServiceEntity)
      .save([
        new ServiceEntityBuilder().withId(serviceA).withTenantId(tenantA).build(),
        new ServiceEntityBuilder().withId(serviceB).withTenantId(tenantB).build(),
      ]);
  });

  afterAll(async () => {
    try {
      const tenantIds = [tenantA, tenantB];
      await dataSource.query(
        `DELETE FROM booking.booking_status_transitions WHERE tenant_id = ANY($1)`,
        [tenantIds],
      );
      await dataSource.query(`DELETE FROM booking.bookings WHERE tenant_id = ANY($1)`, [tenantIds]);
      await dataSource.query(
        `DELETE FROM booking.recurring_booking_schedules WHERE tenant_id = ANY($1)`,
        [tenantIds],
      );
      await dataSource.query(`DELETE FROM booking.services WHERE tenant_id = ANY($1)`, [tenantIds]);
    } finally {
      await dataSource.destroy();
    }
  });

  describe('findBookingsEndingAfter()', () => {
    it('counts a live booking that ends after the boundary and skips one ending exactly at it', async () => {
      const tenant = uuidv7();
      const aMinuteAfter = await seedBooking(tenant, MINUTE_MS);
      await seedBooking(tenant, 0); // ends exactly at the local midnight: occupies nothing of the day
      await seedBooking(tenant, -DAY_MS); // ended the day before

      const page = await blockersRepo.findBookingsEndingAfter(tenant, BOUNDARY, EFFECTIVE_DATE, 10);

      expect(page.total).toBe(1);
      expect(page.sample.map((b) => b.id)).toEqual([aMinuteAfter]);
    });

    it('counts PENDING, INFO_REQUESTED and APPROVED and ignores every terminal status', async () => {
      const tenant = uuidv7();
      const live = [
        await seedBooking(tenant, DAY_MS, { status: BookingStatus.PENDING }),
        await seedBooking(tenant, 2 * DAY_MS, { status: BookingStatus.INFO_REQUESTED }),
        await seedBooking(tenant, 3 * DAY_MS, { status: BookingStatus.APPROVED }),
      ];
      for (const status of [
        BookingStatus.CANCELLED,
        BookingStatus.REJECTED,
        BookingStatus.NO_SHOW,
      ]) {
        await seedBooking(tenant, 4 * DAY_MS, { status });
      }

      const page = await blockersRepo.findBookingsEndingAfter(tenant, BOUNDARY, EFFECTIVE_DATE, 10);

      expect(page.total).toBe(3);
      expect(page.sample.map((b) => b.id)).toEqual(live);
    });

    it('keeps the exact total beyond the sample limit and orders the sample by end then id', async () => {
      const tenant = uuidv7();
      const ids: string[] = [];
      for (let day = 1; day <= 4; day += 1) ids.push(await seedBooking(tenant, day * DAY_MS));

      const page = await blockersRepo.findBookingsEndingAfter(tenant, BOUNDARY, EFFECTIVE_DATE, 2);

      expect(page.total).toBe(4);
      expect(page.sample.map((b) => b.id)).toEqual(ids.slice(0, 2));
    });

    it('returns nothing, not an error, when no booking blocks', async () => {
      const page = await blockersRepo.findBookingsEndingAfter(
        uuidv7(),
        BOUNDARY,
        EFFECTIVE_DATE,
        10,
      );

      expect(page).toEqual({ total: 0, sample: [] });
    });

    it('leaves out the occurrences of an ACTIVE or PENDING_APPROVAL schedule, and keeps those of an ended one', async () => {
      const tenant = uuidv7();
      const service = uuidv7();
      await dataSource
        .getRepository(ServiceEntity)
        .save(new ServiceEntityBuilder().withId(service).withTenantId(tenant).build());
      const active = await seedSchedule(tenant, service, '2026-12-30');
      const pending = await seedSchedule(tenant, service, '2026-12-30', 'PENDING_APPROVAL');
      const ended = await seedSchedule(tenant, service, '2026-12-30', 'ENDED');
      await seedBooking(tenant, DAY_MS, { scheduleId: active });
      await seedBooking(tenant, 2 * DAY_MS, { scheduleId: active });
      await seedBooking(tenant, 3 * DAY_MS, { scheduleId: pending });
      const strandedOccurrence = await seedBooking(tenant, 4 * DAY_MS, { scheduleId: ended });
      const oneOff = await seedBooking(tenant, 5 * DAY_MS);

      const page = await blockersRepo.findBookingsEndingAfter(tenant, BOUNDARY, EFFECTIVE_DATE, 10);

      expect(page.sample.map((b) => b.id)).toEqual([strandedOccurrence, oneOff]);
      expect(page.total).toBe(2);
    });

    it('keeps the final occurrence of a schedule whose last day is before the date when it runs past the boundary', async () => {
      const tenant = uuidv7();
      const service = uuidv7();
      await dataSource
        .getRepository(ServiceEntity)
        .save(new ServiceEntityBuilder().withId(service).withTenantId(tenant).build());
      // Last day is the 14th, so the schedule statement does not count it, but its final
      // occurrence starts on the 14th and ends after the local midnight of the 15th.
      const endedTheDayBefore = await seedSchedule(tenant, service, '2026-12-14');
      const crossesMidnight = await seedBooking(tenant, 30 * MINUTE_MS, {
        scheduleId: endedTheDayBefore,
      });
      const countedSchedule = await seedSchedule(tenant, service, '2026-12-30');
      await seedBooking(tenant, 2 * DAY_MS, { scheduleId: countedSchedule });

      const bookings = await blockersRepo.findBookingsEndingAfter(
        tenant,
        BOUNDARY,
        EFFECTIVE_DATE,
        10,
      );
      const schedules = await blockersRepo.findSchedulesEndingOnOrAfter(tenant, EFFECTIVE_DATE, 10);

      expect(bookings.sample.map((b) => b.id)).toEqual([crossesMidnight]);
      expect(bookings.total).toBe(1);
      expect(schedules.sample.map((s) => s.id)).toEqual([countedSchedule]);
    });

    it("never counts another tenant's bookings (tenant isolation)", async () => {
      const mine = await seedBooking(tenantA, DAY_MS);
      await seedBooking(tenantB, DAY_MS);
      await seedBooking(tenantB, 2 * DAY_MS);

      const page = await blockersRepo.findBookingsEndingAfter(
        tenantA,
        BOUNDARY,
        EFFECTIVE_DATE,
        100,
      );

      expect(page.sample.map((b) => b.id)).toContain(mine);
      const otherTenant = await blockersRepo.findBookingsEndingAfter(
        tenantB,
        BOUNDARY,
        EFFECTIVE_DATE,
        100,
      );
      expect(otherTenant.sample.map((b) => b.id)).not.toContain(mine);
      expect(page.total).toBe(page.sample.length);
    });

    it('starts from a tenant_id index condition (EXPLAIN with sequential scans disabled)', async () => {
      const runner = dataSource.createQueryRunner();
      await runner.connect();
      try {
        await runner.query('BEGIN');
        await runner.query('SET LOCAL enable_seqscan = off');
        const rows: Array<{ 'QUERY PLAN': unknown }> = await runner.query(
          `EXPLAIN (FORMAT JSON) ${FEATURE_REMOVAL_BOOKING_BLOCKERS_SQL}`,
          [
            tenantA,
            ['PENDING', 'INFO_REQUESTED', 'APPROVED'],
            BOUNDARY,
            ['PENDING_APPROVAL', 'ACTIVE'],
            EFFECTIVE_DATE,
            10,
          ],
        );
        await runner.query('ROLLBACK');

        const plan = JSON.stringify(rows[0]['QUERY PLAN']);
        expect(plan).toMatch(/"Index Cond":"\([^"]*tenant_id[^"]*\)/);
      } finally {
        await runner.release();
      }
    });
  });

  describe('findSchedulesEndingOnOrAfter()', () => {
    it('counts PENDING_APPROVAL and ACTIVE schedules whose last day is on or after the date', async () => {
      const tenant = uuidv7();
      const service = uuidv7();
      await dataSource
        .getRepository(ServiceEntity)
        .save(new ServiceEntityBuilder().withId(service).withTenantId(tenant).build());
      const onTheDate = await seedSchedule(tenant, service, EFFECTIVE_DATE);
      const later = await seedSchedule(tenant, service, '2026-12-20', 'PENDING_APPROVAL');
      await seedSchedule(tenant, service, '2026-12-14'); // ends the day before: does not reach it
      await seedSchedule(tenant, service, '2026-12-30', 'ENDED');
      await seedSchedule(tenant, service, '2026-12-30', 'CANCELLED');

      const page = await blockersRepo.findSchedulesEndingOnOrAfter(tenant, EFFECTIVE_DATE, 10);

      expect(page.total).toBe(2);
      expect(page.sample).toEqual([
        { id: onTheDate, endsOn: EFFECTIVE_DATE },
        { id: later, endsOn: '2026-12-20' },
      ]);
    });

    it('keeps the exact total beyond the sample limit', async () => {
      const tenant = uuidv7();
      const service = uuidv7();
      await dataSource
        .getRepository(ServiceEntity)
        .save(new ServiceEntityBuilder().withId(service).withTenantId(tenant).build());
      for (const endsOn of ['2026-12-16', '2026-12-17', '2026-12-18']) {
        await seedSchedule(tenant, service, endsOn);
      }

      const page = await blockersRepo.findSchedulesEndingOnOrAfter(tenant, EFFECTIVE_DATE, 2);

      expect(page.total).toBe(3);
      expect(page.sample.map((s) => s.endsOn)).toEqual(['2026-12-16', '2026-12-17']);
    });

    it('starts from a tenant_id index condition (EXPLAIN with sequential scans disabled)', async () => {
      const runner = dataSource.createQueryRunner();
      await runner.connect();
      try {
        await runner.query('BEGIN');
        await runner.query('SET LOCAL enable_seqscan = off');
        const rows: Array<{ 'QUERY PLAN': unknown }> = await runner.query(
          `EXPLAIN (FORMAT JSON) ${FEATURE_REMOVAL_SCHEDULE_BLOCKERS_SQL}`,
          [tenantA, ['PENDING_APPROVAL', 'ACTIVE'], EFFECTIVE_DATE, 10],
        );
        await runner.query('ROLLBACK');

        expect(JSON.stringify(rows[0]['QUERY PLAN'])).toMatch(
          /"Index Cond":"\([^"]*tenant_id[^"]*\)/,
        );
      } finally {
        await runner.release();
      }
    });

    it("never counts another tenant's schedules (tenant isolation)", async () => {
      const mine = await seedSchedule(tenantA, serviceA, '2026-12-25');
      await seedSchedule(tenantB, serviceB, '2026-12-25');

      const page = await blockersRepo.findSchedulesEndingOnOrAfter(tenantA, EFFECTIVE_DATE, 100);

      expect(page.sample.map((s) => s.id)).toEqual([mine]);
      expect(page.total).toBe(1);
    });
  });
  describe('GetBookingFeatureRemovalImpactUseCase over the real read model', () => {
    // "Alerts never block" holds by omission (no query reads them), so it is pinned the way it can
    // regress: a live alert in the database that outlives the effective date leaves the answer empty.
    it('never counts an ACTIVE availability alert, whatever its expiry', async () => {
      const tenant = uuidv7();
      const service = uuidv7();
      await dataSource
        .getRepository(ServiceEntity)
        .save(new ServiceEntityBuilder().withId(service).withTenantId(tenant).build());
      await dataSource.getRepository(AvailabilityAlertEntity).save(
        new AvailabilityAlertEntityBuilder()
          .withTenantId(tenant)
          .withServiceId(service)
          .withStatus('ACTIVE')
          .withExpiresAt(new Date(BOUNDARY.getTime() + 30 * DAY_MS))
          .build(),
      );
      const settings = new InMemoryTenantSettingsPort();
      settings.set(tenant, TenantSettings.default(TIMEZONE).toJSON());
      const useCase = new GetBookingFeatureRemovalImpactUseCase(blockersRepo, settings);

      const result = await useCase.execute({ tenantId: tenant, effectiveDate: EFFECTIVE_DATE });

      expect(result).toEqual({
        effectiveFrom: EFFECTIVE_DATE,
        bookings: 0,
        recurringSchedules: 0,
        blockers: [],
      });
    });

    it('names an APPROVED booking past the date, and answers zero once it is cancelled', async () => {
      const tenant = uuidv7();
      const settings = new InMemoryTenantSettingsPort();
      settings.set(tenant, TenantSettings.default(TIMEZONE).toJSON());
      const useCase = new GetBookingFeatureRemovalImpactUseCase(blockersRepo, settings);
      const bookingId = await seedBooking(tenant, 2 * DAY_MS);

      const blocked = await useCase.execute({ tenantId: tenant, effectiveDate: EFFECTIVE_DATE });

      expect(blocked.bookings).toBe(1);
      expect(blocked.blockers).toEqual([
        { category: 'BOOKING', id: bookingId, date: '2026-12-17' },
      ]);

      await dataSource.query(`UPDATE booking.bookings SET status = 'CANCELLED' WHERE id = $1`, [
        bookingId,
      ]);

      const cleared = await useCase.execute({ tenantId: tenant, effectiveDate: EFFECTIVE_DATE });

      expect(cleared).toEqual({
        effectiveFrom: EFFECTIVE_DATE,
        bookings: 0,
        recurringSchedules: 0,
        blockers: [],
      });
    });
  });
});
