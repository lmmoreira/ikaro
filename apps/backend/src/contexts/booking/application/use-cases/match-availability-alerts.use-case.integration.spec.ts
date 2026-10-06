import { DataSource } from 'typeorm';
import { uuidv7 } from '../../../../shared/domain/uuid-v7';
import { TypeOrmTransactionManager } from '../../../../shared/infrastructure/typeorm-transaction-manager';
import { OutboxEventEntity } from '../../../../shared/infrastructure/outbox/outbox-event.entity';
import { TypeOrmOutboxRepository } from '../../../../shared/infrastructure/outbox/typeorm-outbox.repository';
import { Money } from '../../../../shared/value-objects/money';
import { localDateTimeToUTCIso } from '../../../../shared/utils/calendar-date';
import {
  AvailabilityAlertEntityBuilder,
  BookingBuilder,
  BookingLineBuilder,
  ResourceEntityBuilder,
  ResourceOccupancyEntityBuilder,
  ServiceEntityBuilder,
} from '../../../../test/builders/booking/index';
import { BookingCancelledEventBuilder } from '../../../../test/builders/booking/booking-cancelled-event.builder';
import { BookingRejectedEventBuilder } from '../../../../test/builders/booking/booking-rejected-event.builder';
import { BookingRescheduledEventBuilder } from '../../../../test/builders/booking/booking-rescheduled-event.builder';
import { makeRealOutboxPublisher } from '../../../../test/factories/real-outbox-publisher.factory';
import { InMemoryBookingPlatformPort } from '../../../../test/infrastructure/in-memory-booking-platform.port';
import { InMemoryEventBus } from '../../../../test/infrastructure/in-memory-event-bus';
import { InMemoryTenantSettingsPort } from '../../../../test/infrastructure/in-memory-tenant-settings.port';
import { createTestDataSource } from '../../../../test/test-datasource';
import { nextWeekday } from '../../../../test/utils/date-helpers';
import { FULL_WEEK_BUSINESS_HOURS } from '../../../../test/utils/business-hours-fixtures';
import { BookingStatus } from '../../domain/booking.aggregate';
import { ResourceType } from '../../domain/resource.types';
import { AvailabilityService } from '../../domain/services/availability.service';
import { TypeOrmBookingAvailabilityAdapter } from '../../infrastructure/cross-context/typeorm-booking-availability.adapter';
import { AvailabilityAlertEntity } from '../../infrastructure/entities/availability-alert.entity';
import { BookingAttendeeEntity } from '../../infrastructure/entities/booking-attendee.entity';
import { BookingEntity } from '../../infrastructure/entities/booking.entity';
import { BookingLineEntity } from '../../infrastructure/entities/booking-line.entity';
import { BookingLineResourceAssignmentEntity } from '../../infrastructure/entities/booking-line-resource-assignment.entity';
import { BookingStatusTransitionEntity } from '../../infrastructure/entities/booking-status-transition.entity';
import { ResourceEntity } from '../../infrastructure/entities/resource.entity';
import { ResourceOccupancyEntity } from '../../infrastructure/entities/resource-occupancy.entity';
import { ScheduleClosureEntity } from '../../infrastructure/entities/schedule-closure.entity';
import { ScheduleOpeningEntity } from '../../infrastructure/entities/schedule-opening.entity';
import { ServiceEntity } from '../../infrastructure/entities/service.entity';
import { BookingCancelledAvailabilityAlertHandler } from '../../infrastructure/events/booking-cancelled-availability-alert.handler';
import { BookingRejectedAvailabilityAlertHandler } from '../../infrastructure/events/booking-rejected-availability-alert.handler';
import { BookingRescheduledAvailabilityAlertHandler } from '../../infrastructure/events/booking-rescheduled-availability-alert.handler';
import { TypeOrmBookingRepository } from '../../infrastructure/repositories/typeorm-booking.repository';
import { TypeOrmBookingStatusTransitionRepository } from '../../infrastructure/repositories/typeorm-booking-status-transition.repository';
import { TypeOrmAvailabilityAlertRepository } from '../../infrastructure/repositories/typeorm-availability-alert.repository';
import { TypeOrmResourceRepository } from '../../infrastructure/repositories/typeorm-resource.repository';
import { TypeOrmScheduleClosureRepository } from '../../infrastructure/repositories/typeorm-schedule-closure.repository';
import { TypeOrmScheduleOpeningRepository } from '../../infrastructure/repositories/typeorm-schedule-opening.repository';
import { TypeOrmServiceRepository } from '../../infrastructure/repositories/typeorm-service.repository';
import { AvailabilityAlertSweepJob } from '../jobs/availability-alert-sweep.job';
import { BookingQuoteService } from '../services/booking-quote.service';
import { GetAvailabilityUseCase } from './get-availability.use-case';
import { MatchAvailabilityAlertsForBookingUseCase } from './match-availability-alerts-for-booking.use-case';
import { MatchAvailabilityAlertsUseCase } from './match-availability-alerts.use-case';

const TZ = FULL_WEEK_BUSINESS_HOURS.timezone;
const DAY_MS = 86_400_000;
const monday = nextWeekday(1);
const farMonday = nextWeekday(1, 4); // three weeks after `monday`
const at = (date: string, hhmm: string): Date => new Date(localDateTimeToUTCIso(date, hhmm, TZ));

// Proves the matching against real rows: the real availability read decides what is bookable, a
// match writes the NOTIFIED status, the deduplicated attempt row and the outbox event in ONE
// transaction, a replayed event or a racing second trigger can never notify twice, and a tenant's
// alerts are only ever matched by that tenant's events.
describe('MatchAvailabilityAlerts (integration)', () => {
  let ds: DataSource;
  let useCase: MatchAvailabilityAlertsUseCase;
  let handler: BookingCancelledAvailabilityAlertHandler;
  let rejectedHandler: BookingRejectedAvailabilityAlertHandler;
  let rescheduledHandler: BookingRescheduledAvailabilityAlertHandler;
  let alertRepo: TypeOrmAvailabilityAlertRepository;
  let bookingRepo: TypeOrmBookingRepository;
  let platformPort: InMemoryBookingPlatformPort;
  const tenantA = uuidv7();
  const tenantB = uuidv7();
  const serviceOf = new Map<string, string>();

  beforeAll(async () => {
    ds = await createTestDataSource();
    for (const tenantId of [tenantA, tenantB]) {
      const service = await ds
        .getRepository(ServiceEntity)
        .save(
          new ServiceEntityBuilder()
            .withTenantId(tenantId)
            .withAvailabilityAlertEligible(true)
            .withDurationMinutes(60)
            .build(),
        );
      serviceOf.set(tenantId, service.id);
      await ds
        .getRepository(ResourceEntity)
        .save(
          new ResourceEntityBuilder()
            .withTenantId(tenantId)
            .withType(ResourceType.LOCATION)
            .build(),
        );
    }

    platformPort = new InMemoryBookingPlatformPort();
    platformPort.seed([
      { id: tenantA, timezone: TZ },
      { id: tenantB, timezone: TZ },
    ]);
    const outboxRepo = new TypeOrmOutboxRepository(ds.getRepository(OutboxEventEntity));
    alertRepo = new TypeOrmAvailabilityAlertRepository(
      ds.getRepository(AvailabilityAlertEntity),
      makeRealOutboxPublisher(outboxRepo, new InMemoryEventBus()),
    );
    const getAvailability = new GetAvailabilityUseCase(
      new TypeOrmServiceRepository(
        ds.getRepository(ServiceEntity),
        new InMemoryTenantSettingsPort(),
      ),
      new TypeOrmScheduleClosureRepository(ds.getRepository(ScheduleClosureEntity)),
      new TypeOrmScheduleOpeningRepository(ds.getRepository(ScheduleOpeningEntity)),
      new TypeOrmResourceRepository(ds.getRepository(ResourceEntity)),
      new TypeOrmBookingAvailabilityAdapter(ds.getRepository(ResourceOccupancyEntity)),
      new AvailabilityService(),
      new BookingQuoteService(),
    );
    useCase = new MatchAvailabilityAlertsUseCase(
      alertRepo,
      platformPort,
      new TypeOrmTransactionManager(ds),
      getAvailability,
    );
    handler = new BookingCancelledAvailabilityAlertHandler(useCase, new InMemoryEventBus());
    bookingRepo = new TypeOrmBookingRepository(
      ds.getRepository(BookingEntity),
      ds.getRepository(BookingLineEntity),
      ds.getRepository(BookingAttendeeEntity),
      ds.getRepository(BookingLineResourceAssignmentEntity),
      new InMemoryTenantSettingsPort(),
      new InMemoryEventBus(),
      new TypeOrmBookingStatusTransitionRepository(ds.getRepository(BookingStatusTransitionEntity)),
    );
    rejectedHandler = new BookingRejectedAvailabilityAlertHandler(
      new MatchAvailabilityAlertsForBookingUseCase(bookingRepo, useCase),
      new InMemoryEventBus(),
    );
    rescheduledHandler = new BookingRescheduledAvailabilityAlertHandler(
      useCase,
      new InMemoryEventBus(),
    );
  });

  afterAll(async () => {
    for (const tenantId of [tenantA, tenantB]) {
      await ds.query(
        'DELETE FROM booking.availability_alert_notification_attempts WHERE tenant_id = $1',
        [tenantId],
      );
      await ds.getRepository(OutboxEventEntity).delete({ tenantId });
      await ds.getRepository(AvailabilityAlertEntity).delete({ tenantId });
      await ds.getRepository(BookingLineEntity).delete({ tenantId });
      await ds.getRepository(BookingEntity).delete({ tenantId });
      await ds.getRepository(ResourceEntity).delete({ tenantId });
      await ds.getRepository(ServiceEntity).delete({ tenantId });
    }
    await ds.destroy();
  });

  // Each test starts from no alerts / attempts / outbox rows of its own.
  beforeEach(async () => {
    for (const tenantId of [tenantA, tenantB]) {
      await ds.query(
        'DELETE FROM booking.availability_alert_notification_attempts WHERE tenant_id = $1',
        [tenantId],
      );
      await ds.getRepository(OutboxEventEntity).delete({ tenantId });
      await ds.getRepository(AvailabilityAlertEntity).delete({ tenantId });
    }
  });

  const seedAlert = async (tenantId: string, start = '10:00', end = '12:00'): Promise<string> => {
    const entity = new AvailabilityAlertEntityBuilder()
      .withTenantId(tenantId)
      .withServiceId(serviceOf.get(tenantId) as string)
      .withOneTimeRange(at(monday, start), at(monday, end))
      .withExpiresAt(new Date(Date.now() + 30 * DAY_MS))
      .build();
    await ds.getRepository(AvailabilityAlertEntity).save(entity);
    return entity.id;
  };

  const attemptsOf = (tenantId: string) =>
    ds.query<{ alert_id: string; channel: string; outcome: string; window_start: Date }[]>(
      `SELECT alert_id, channel, outcome, lower(matching_window) AS window_start
         FROM booking.availability_alert_notification_attempts WHERE tenant_id = $1`,
      [tenantId],
    );

  const matchedEventsOf = async (tenantId: string) =>
    (await ds.getRepository(OutboxEventEntity).find({ where: { tenantId } })).filter(
      (row) => row.eventName === 'AvailabilityAlertMatched',
    );

  const cancelledEvent = (tenantId: string) =>
    new BookingCancelledEventBuilder()
      .withTenantId(tenantId)
      .withCorrelationId('corr-integration')
      .withScheduledAt(at(monday, '10:00'))
      .withServiceId(serviceOf.get(tenantId) as string)
      .build();

  it('a cancelled booking that frees a matching slot notifies the alert: status, attempt row and outbox event commit together', async () => {
    const alertId = await seedAlert(tenantA);

    await handler.handle(cancelledEvent(tenantA));

    const alert = await ds.getRepository(AvailabilityAlertEntity).findOneByOrFail({ id: alertId });
    expect(alert.status).toBe('NOTIFIED');
    expect(alert.version).toBe(2);
    const attempts = await attemptsOf(tenantA);
    expect(attempts).toHaveLength(1);
    expect(attempts[0]).toMatchObject({ alert_id: alertId, channel: 'EMAIL', outcome: 'PENDING' });
    expect(attempts[0].window_start).toEqual(at(monday, '10:00'));
    const events = await matchedEventsOf(tenantA);
    expect(events).toHaveLength(1);
    expect(events[0].payload).toMatchObject({
      data: { alertId, serviceId: serviceOf.get(tenantA) },
    });
  });

  it('replaying the same event notifies nobody again: still one attempt row and one outbox event', async () => {
    await seedAlert(tenantA);
    const event = cancelledEvent(tenantA);

    await handler.handle(event);
    await handler.handle(event);

    expect(await attemptsOf(tenantA)).toHaveLength(1);
    expect(await matchedEventsOf(tenantA)).toHaveLength(1);
  });

  it('a cancellation handler and the daily sweep racing on the same alert produce exactly one attempt row and one event', async () => {
    await seedAlert(tenantA);
    // Monday 06:40 local: inside the sweep window, on the day the alert is about.
    const sweepNow = at(monday, '06:40');

    const settled = await Promise.allSettled([
      handler.handle(cancelledEvent(tenantA)),
      new AvailabilityAlertSweepJob(platformPort, useCase).run(sweepNow),
    ]);

    // The loser of the race is a version-check conflict handled inside the use case, not a failure.
    expect(settled.map((outcome) => outcome.status)).toEqual(['fulfilled', 'fulfilled']);
    expect(await attemptsOf(tenantA)).toHaveLength(1);
    expect(await matchedEventsOf(tenantA)).toHaveLength(1);
    const [alert] = await ds
      .getRepository(AvailabilityAlertEntity)
      .find({ where: { tenantId: tenantA } });
    expect(alert.status).toBe('NOTIFIED');
    expect(alert.version).toBe(2);
  });

  it('does not notify when the slot is not actually free: a booking-occupied resource blocks the match', async () => {
    await seedAlert(tenantA);
    const [location] = await ds
      .getRepository(ResourceEntity)
      .find({ where: { tenantId: tenantA } });
    // A class session holds the whole location all day: no start inside the range is free.
    const occupancy = await ds
      .getRepository(ResourceOccupancyEntity)
      .save(
        new ResourceOccupancyEntityBuilder()
          .withTenantId(tenantA)
          .withResourceId(location.id)
          .withSourceType('CLASS_SESSION')
          .withBookingLineResourceAssignmentId(null)
          .withClassSessionId(uuidv7())
          .withStartsAt(at(monday, '08:00'))
          .withEndsAt(at(monday, '19:00'))
          .build(),
      );

    try {
      await handler.handle(cancelledEvent(tenantA));

      expect(await attemptsOf(tenantA)).toEqual([]);
      expect(await matchedEventsOf(tenantA)).toEqual([]);
    } finally {
      await ds
        .getRepository(ResourceOccupancyEntity)
        .delete({ tenantId: tenantA, id: occupancy.id });
    }
  });

  it("tenant isolation: tenant A's event never matches tenant B's alert, even naming B's service", async () => {
    await seedAlert(tenantB);
    const foreign = new BookingCancelledEventBuilder()
      .withTenantId(tenantA)
      .withCorrelationId('corr-isolation')
      .withScheduledAt(at(monday, '10:00'))
      .withServiceId(serviceOf.get(tenantB) as string)
      .build();

    await handler.handle(foreign);

    const [alertB] = await ds
      .getRepository(AvailabilityAlertEntity)
      .find({ where: { tenantId: tenantB } });
    expect(alertB.status).toBe('ACTIVE');
    expect(await attemptsOf(tenantB)).toEqual([]);
    expect(await matchedEventsOf(tenantB)).toEqual([]);
  });

  describe('the other capacity-release triggers', () => {
    const seedBooking = async (
      tenantId: string,
      status: BookingStatus = BookingStatus.REJECTED,
    ): Promise<string> => {
      const line = new BookingLineBuilder()
        .withLineId(uuidv7())
        .withServiceId(serviceOf.get(tenantId) as string)
        .withPriceAtBooking(Money.from(100, 'BRL'))
        .withPointsValueAtBooking(10)
        .build();
      const booking = new BookingBuilder()
        .withTenantId(tenantId)
        .withStatus(status)
        .withLines([line])
        .withTotalPrice(Money.from(100, 'BRL'))
        .withScheduledAt(at(monday, '10:00'))
        .build();
      await bookingRepo.save(booking);
      return booking.id;
    };

    afterEach(async () => {
      for (const tenantId of [tenantA, tenantB]) {
        await ds.getRepository(BookingLineEntity).delete({ tenantId });
        await ds.getRepository(BookingEntity).delete({ tenantId });
      }
    });

    it('a rejected booking that held a matching slot notifies the alert — the booking is resolved by id', async () => {
      const alertId = await seedAlert(tenantA);
      const bookingId = await seedBooking(tenantA);

      await rejectedHandler.handle(
        new BookingRejectedEventBuilder().withTenantId(tenantA).withBookingId(bookingId).build(),
      );

      const alert = await ds
        .getRepository(AvailabilityAlertEntity)
        .findOneByOrFail({ id: alertId });
      expect(alert.status).toBe('NOTIFIED');
      const attempts = await attemptsOf(tenantA);
      expect(attempts).toHaveLength(1);
      expect(attempts[0].window_start).toEqual(at(monday, '10:00'));
      expect(await matchedEventsOf(tenantA)).toHaveLength(1);
    });

    it('a rejection for a booking that does not exist notifies nobody and does not fail', async () => {
      await seedAlert(tenantA);

      await rejectedHandler.handle(
        new BookingRejectedEventBuilder().withTenantId(tenantA).withBookingId(uuidv7()).build(),
      );

      expect(await attemptsOf(tenantA)).toEqual([]);
    });

    it("tenant isolation: a rejection event for tenant B never resolves tenant A's booking", async () => {
      await seedAlert(tenantA);
      const bookingId = await seedBooking(tenantA);

      await rejectedHandler.handle(
        new BookingRejectedEventBuilder().withTenantId(tenantB).withBookingId(bookingId).build(),
      );

      expect(await attemptsOf(tenantA)).toEqual([]);
      expect(await attemptsOf(tenantB)).toEqual([]);
    });

    it('a rescheduled booking frees its PREVIOUS slot and notifies the alert waiting for it', async () => {
      const oldWindowAlert = await seedAlert(tenantA, '10:00', '12:00');
      const event = new BookingRescheduledEventBuilder()
        .withTenantId(tenantA)
        .withServiceId(serviceOf.get(tenantA) as string)
        .withPreviousSlotStart(at(monday, '10:00'))
        .build();

      await rescheduledHandler.handle(event);

      const alert = await ds
        .getRepository(AvailabilityAlertEntity)
        .findOneByOrFail({ id: oldWindowAlert });
      expect(alert.status).toBe('NOTIFIED');
      const attempts = await attemptsOf(tenantA);
      expect(attempts).toHaveLength(1);
      expect(attempts[0].window_start).toEqual(at(monday, '10:00'));
      expect(await matchedEventsOf(tenantA)).toHaveLength(1);
    });
  });

  describe('criteria and duration on real data', () => {
    afterEach(() => {
      platformPort.clear();
      platformPort.seed([
        { id: tenantA, timezone: TZ },
        { id: tenantB, timezone: TZ },
      ]);
    });

    const seedWeekly = async (tenantId: string): Promise<string> => {
      const entity = new AvailabilityAlertEntityBuilder()
        .withTenantId(tenantId)
        .withServiceId(serviceOf.get(tenantId) as string)
        .withWeeklyPreference(['monday'], '14:00', '16:00')
        .withExpiresAt(new Date(Date.now() + 30 * DAY_MS))
        .build();
      await ds.getRepository(AvailabilityAlertEntity).save(entity);
      return entity.id;
    };

    it('a weekly-preference alert matches a Monday slot starting inside its local window', async () => {
      const alertId = await seedWeekly(tenantA);
      platformPort.clear();
      platformPort.seed([{ id: tenantA, timezone: TZ }]);

      await new AvailabilityAlertSweepJob(platformPort, useCase).run(at(monday, '06:40'));

      expect(
        (await ds.getRepository(AvailabilityAlertEntity).findOneByOrFail({ id: alertId })).status,
      ).toBe('NOTIFIED');
      const [attempt] = await attemptsOf(tenantA);
      expect(attempt.window_start).toEqual(at(monday, '14:00'));
    });

    it('a customer-selected duration is honoured: a valid chosen duration matches, one off the increment does not', async () => {
      const variable = await ds
        .getRepository(ServiceEntity)
        .save(
          new ServiceEntityBuilder()
            .withTenantId(tenantA)
            .withAvailabilityAlertEligible(true)
            .withDurationPolicy('CUSTOMER_SELECTED')
            .withDurationMinMinutes(30)
            .withDurationMaxMinutes(120)
            .withDurationIncrementMinutes(30)
            .build(),
        );
      const seedFor = async (durationMinutes: number): Promise<string> => {
        const entity = new AvailabilityAlertEntityBuilder()
          .withTenantId(tenantA)
          .withServiceId(variable.id)
          .withDurationMinutes(durationMinutes)
          .withOneTimeRange(at(monday, '10:00'), at(monday, '12:00'))
          .withExpiresAt(new Date(Date.now() + 30 * DAY_MS))
          .build();
        await ds.getRepository(AvailabilityAlertEntity).save(entity);
        return entity.id;
      };
      const valid = await seedFor(90);
      const offIncrement = await seedFor(45);

      await useCase.execute({
        tenantId: tenantA,
        correlationId: 'corr-duration',
        serviceIds: [variable.id],
        around: at(monday, '10:00'),
      });

      const statusOf = async (id: string) =>
        (await ds.getRepository(AvailabilityAlertEntity).findOneByOrFail({ id })).status;
      expect(await statusOf(valid)).toBe('NOTIFIED');
      expect(await statusOf(offIncrement)).toBe('ACTIVE');
    });
  });

  describe('the sweep horizon and the alert queries', () => {
    afterEach(() => {
      platformPort.clear();
      platformPort.seed([
        { id: tenantA, timezone: TZ },
        { id: tenantB, timezone: TZ },
      ]);
    });

    const farMondayRange = async (tenantId: string): Promise<string> => {
      const entity = new AvailabilityAlertEntityBuilder()
        .withTenantId(tenantId)
        .withServiceId(serviceOf.get(tenantId) as string)
        .withOneTimeRange(at(farMonday, '10:00'), at(farMonday, '12:00'))
        .withExpiresAt(new Date(Date.now() + 60 * DAY_MS))
        .build();
      await ds.getRepository(AvailabilityAlertEntity).save(entity);
      return entity.id;
    };

    it('a date just outside the selectable window is not matched; once the window reaches it, it matches exactly once', async () => {
      const alertId = await farMondayRange(tenantA);
      platformPort.clear();
      platformPort.seed([{ id: tenantA, timezone: TZ }]);
      const sweep = new AvailabilityAlertSweepJob(platformPort, useCase);
      const now = at(monday, '06:40');
      const contextFor = (selectableDays: number) => ({
        businessHours: FULL_WEEK_BUSINESS_HOURS,
        slotGranularityMinutes: 30 as const,
        serviceBufferMinutes: 0,
        selectableDays,
      });
      const statusNow = async () =>
        (await ds.getRepository(AvailabilityAlertEntity).findOneByOrFail({ id: alertId })).status;

      platformPort.seedAvailabilityAlertContext(tenantA, contextFor(14));
      await sweep.run(now);
      expect(await statusNow()).toBe('ACTIVE');
      expect(await attemptsOf(tenantA)).toEqual([]);

      platformPort.seedAvailabilityAlertContext(tenantA, contextFor(40));
      await sweep.run(now);
      expect(await statusNow()).toBe('NOTIFIED');
      await sweep.run(now);
      expect(await attemptsOf(tenantA)).toHaveLength(1);
      expect(await matchedEventsOf(tenantA)).toHaveLength(1);
    });

    it("the alert queries are tenant-scoped: another tenant's alerts and services never appear", async () => {
      const aAlert = await seedAlert(tenantA);
      await seedAlert(tenantB);
      const now = new Date();

      const forA = await alertRepo.findActiveByService(
        tenantA,
        serviceOf.get(tenantA) as string,
        now,
      );
      expect(forA.map((alert) => alert.id)).toEqual([aAlert]);
      expect(
        await alertRepo.findActiveByService(tenantA, serviceOf.get(tenantB) as string, now),
      ).toEqual([]);
      expect(await alertRepo.findServiceIdsWithActiveAlerts(tenantA, now)).toEqual([
        serviceOf.get(tenantA),
      ]);
    });
  });

  describe('the daily sweep', () => {
    it('matches a free slot with no booking event at all, once, inside the tenant-local morning window', async () => {
      const alertId = await seedAlert(tenantA);
      const sweep = new AvailabilityAlertSweepJob(platformPort, useCase);
      // Monday 06:40 local: inside 06:30–06:59, and the day the alert is about.
      const now = at(monday, '06:40');

      const first = await sweep.run(now);
      const second = await sweep.run(now);

      expect(first.notified).toBe(1);
      expect(second.notified).toBe(0);
      expect(
        (await ds.getRepository(AvailabilityAlertEntity).findOneByOrFail({ id: alertId })).status,
      ).toBe('NOTIFIED');
      expect(await attemptsOf(tenantA)).toHaveLength(1);
    });

    it('does nothing outside the window', async () => {
      const alertId = await seedAlert(tenantA);
      const sweep = new AvailabilityAlertSweepJob(platformPort, useCase);

      const result = await sweep.run(at(monday, '08:00'));

      expect(result).toEqual({ tenantsSwept: 0, notified: 0 });
      expect(
        (await ds.getRepository(AvailabilityAlertEntity).findOneByOrFail({ id: alertId })).status,
      ).toBe('ACTIVE');
    });

    it("only ever reads and notifies the swept tenant's own alerts", async () => {
      const alertA = await seedAlert(tenantA);
      const alertB = await seedAlert(tenantB);
      platformPort.clear();
      platformPort.seed([{ id: tenantA, timezone: TZ }]);

      await new AvailabilityAlertSweepJob(platformPort, useCase).run(at(monday, '06:40'));

      expect(
        (await ds.getRepository(AvailabilityAlertEntity).findOneByOrFail({ id: alertA })).status,
      ).toBe('NOTIFIED');
      expect(
        (await ds.getRepository(AvailabilityAlertEntity).findOneByOrFail({ id: alertB })).status,
      ).toBe('ACTIVE');
    });
  });
});
