import { Envelope } from '../../../../shared/domain/envelope';
import {
  getUtcWeekDayName,
  localDateTimeToUTCIso,
  utcDateToLocalDate,
  utcDateToLocalHHMM,
} from '../../../../shared/utils/calendar-date';
import { AvailabilityAlertBuilder } from '../../../../test/builders/booking/availability-alert.builder';
import { ResourceBuilder } from '../../../../test/builders/booking/resource.builder';
import { ServiceBuilder } from '../../../../test/builders/booking/service.builder';
import { InMemoryBookingAvailabilityPort } from '../../../../test/infrastructure/in-memory-booking-availability';
import { InMemoryBookingPlatformPort } from '../../../../test/infrastructure/in-memory-booking-platform.port';
import { InMemoryTransactionManager } from '../../../../test/infrastructure/in-memory-transaction-manager';
import { InMemoryAvailabilityAlertRepository } from '../../../../test/repositories/booking/in-memory-availability-alert.repository';
import { InMemoryResourceRepository } from '../../../../test/repositories/booking/in-memory-resource.repository';
import { InMemoryScheduleClosureRepository } from '../../../../test/repositories/booking/in-memory-schedule-closure.repository';
import { InMemoryScheduleOpeningRepository } from '../../../../test/repositories/booking/in-memory-schedule-opening.repository';
import { InMemoryServiceRepository } from '../../../../test/repositories/booking/in-memory-service.repository';
import { nextWeekday } from '../../../../test/utils/date-helpers';
import { FULL_WEEK_BUSINESS_HOURS } from '../../../../test/utils/business-hours-fixtures';
import { AvailabilityAlert } from '../../domain/availability-alert.aggregate';
import { BookingConcurrentModificationError } from '../../domain/errors/booking-domain.error';
import { ResourceRequirement } from '../../domain/resource-requirement';
import { ResourceType } from '../../domain/resource.types';
import { AvailabilityService } from '../../domain/services/availability.service';
import { BookingQuoteService } from '../services/booking-quote.service';
import { GetAvailabilityUseCase } from './get-availability.use-case';
import { MatchAvailabilityAlertsUseCase } from './match-availability-alerts.use-case';

const TENANT_ID = '00000000-0000-7000-8000-000000000001';
const OTHER_TENANT_ID = '99999999-0000-7000-8000-000000000099';
const CORRELATION_ID = 'corr-match-1';
const TZ = FULL_WEEK_BUSINESS_HOURS.timezone;
const DAY_MS = 86_400_000;

// The next Monday and Tuesday (UTC weekday — the tenant's hours are the same date locally).
const monday = nextWeekday(1);
const tuesday = nextWeekday(2);
const farMonday = nextWeekday(1, 4);

const at = (date: string, hhmm: string): Date => new Date(localDateTimeToUTCIso(date, hhmm, TZ));

// Fails the first save() with the optimistic-lock error, as a racing trigger would.
class ConflictingAlertRepository extends InMemoryAvailabilityAlertRepository {
  override save(_alert: AvailabilityAlert): Promise<void> {
    return Promise.reject(new BookingConcurrentModificationError());
  }
}

describe('MatchAvailabilityAlertsUseCase', () => {
  let alertRepo: InMemoryAvailabilityAlertRepository;
  let serviceRepo: InMemoryServiceRepository;
  let resourceRepo: InMemoryResourceRepository;
  let bookingPort: InMemoryBookingAvailabilityPort;
  let platformPort: InMemoryBookingPlatformPort;
  let published: Envelope[];
  let useCase: MatchAvailabilityAlertsUseCase;
  let serviceId: string;
  let locationId: string;

  function build(
    repo: InMemoryAvailabilityAlertRepository = alertRepo,
  ): MatchAvailabilityAlertsUseCase {
    return new MatchAvailabilityAlertsUseCase(
      repo,
      platformPort,
      new InMemoryTransactionManager(),
      serviceRepo,
      new GetAvailabilityUseCase(
        serviceRepo,
        new InMemoryScheduleClosureRepository(),
        new InMemoryScheduleOpeningRepository(),
        resourceRepo,
        bookingPort,
        new AvailabilityService(),
        new BookingQuoteService(),
      ),
    );
  }

  function alertFor(
    overrides: { tenantId?: string; serviceId?: string; resourceId?: string | null } = {},
  ): AvailabilityAlertBuilder {
    return new AvailabilityAlertBuilder()
      .withTenantId(overrides.tenantId ?? TENANT_ID)
      .withServiceId(overrides.serviceId ?? serviceId)
      .withPreferredResourceId(overrides.resourceId ?? null)
      .withExpiresAt(new Date(Date.now() + 30 * DAY_MS));
  }

  const sweep = (now = new Date()) =>
    useCase.execute({
      tenantId: TENANT_ID,
      correlationId: CORRELATION_ID,
      serviceIds: null,
      around: null,
      now,
    });

  beforeEach(async () => {
    published = [];
    alertRepo = new InMemoryAvailabilityAlertRepository({
      publish: async (event) => {
        published.push(event);
      },
    });
    serviceRepo = new InMemoryServiceRepository();
    resourceRepo = new InMemoryResourceRepository();
    bookingPort = new InMemoryBookingAvailabilityPort();
    platformPort = new InMemoryBookingPlatformPort();
    useCase = build();

    const service = new ServiceBuilder().withTenantId(TENANT_ID).withDurationMinutes(60).build();
    await serviceRepo.save(service);
    serviceId = service.id;
    const location = new ResourceBuilder()
      .withTenantId(TENANT_ID)
      .withType(ResourceType.LOCATION)
      .build();
    await resourceRepo.save(location);
    locationId = location.id;
  });

  describe('one-time range alerts', () => {
    it('notifies once, with the earliest bookable slot starting inside the range as the matching window', async () => {
      const alert = alertFor().withOneTimeRange(at(monday, '10:00'), at(monday, '12:00')).build();
      alertRepo.seed(alert);

      const result = await sweep();

      expect(result.notified).toBe(1);
      expect(alert.status).toBe('NOTIFIED');
      expect(alertRepo.attempts).toHaveLength(1);
      expect(alertRepo.attempts[0]).toMatchObject({
        alertId: alert.id,
        tenantId: TENANT_ID,
        channel: 'EMAIL',
        outcome: 'PENDING',
        matchingWindow: { startsAt: at(monday, '10:00') },
      });
      expect(alertRepo.attempts[0].matchingWindow.endsAt.getTime()).toBeGreaterThan(
        at(monday, '10:00').getTime(),
      );
      expect(published.map((event) => event.eventName)).toEqual(['AvailabilityAlertMatched']);
      expect(published[0].correlationId).toBe(CORRELATION_ID);
    });

    it('does not notify when every slot inside the range is already booked', async () => {
      bookingPort.setSlots([
        { resourceId: locationId, startsAt: at(monday, '09:00'), endsAt: at(monday, '18:00') },
      ]);
      const alert = alertFor().withOneTimeRange(at(monday, '10:00'), at(monday, '12:00')).build();
      alertRepo.seed(alert);

      const result = await sweep();

      expect(result.notified).toBe(0);
      expect(alert.status).toBe('ACTIVE');
      expect(alertRepo.attempts).toEqual([]);
      expect(published).toEqual([]);
    });

    it('does not notify when the only free time is before the range the customer can start in', async () => {
      // 09:00–17:00 is booked, so the last bookable start is later than the 08:00–09:00 range.
      bookingPort.setSlots([
        { resourceId: locationId, startsAt: at(monday, '09:00'), endsAt: at(monday, '17:00') },
      ]);
      const alert = alertFor().withOneTimeRange(at(monday, '07:00'), at(monday, '09:00')).build();
      alertRepo.seed(alert);

      expect((await sweep()).notified).toBe(0);
      expect(alert.status).toBe('ACTIVE');
    });

    it('ignores slots that have already started — only a future slot satisfies the alert', async () => {
      // "Now" is Monday 12:30: the 10:00 and 12:00 slots are gone, 13:00 onwards is bookable.
      const early = alertFor().withOneTimeRange(at(monday, '10:00'), at(monday, '12:30')).build();
      const later = alertFor().withOneTimeRange(at(monday, '13:00'), at(monday, '15:00')).build();
      alertRepo.seed(early);
      alertRepo.seed(later);

      const result = await sweep(at(monday, '12:30'));

      expect(result.notified).toBe(1);
      expect(early.status).toBe('ACTIVE');
      expect(later.status).toBe('NOTIFIED');
      expect(alertRepo.attempts[0].matchingWindow.startsAt).toEqual(at(monday, '13:00'));
    });
  });

  describe('weekly preference alerts', () => {
    it('notifies when a bookable slot falls on a listed weekday inside the local time window', async () => {
      const alert = alertFor().withWeeklyPreference(['monday'], '14:00', '16:00').build();
      alertRepo.seed(alert);

      expect((await sweep()).notified).toBe(1);
      // The earliest Monday 14:00 local start inside the window (today's, if it is still ahead).
      const { startsAt } = alertRepo.attempts[0].matchingWindow;
      expect(utcDateToLocalHHMM(startsAt, TZ)).toBe('14:00');
      expect(getUtcWeekDayName(utcDateToLocalDate(startsAt, TZ))).toBe('monday');
    });

    it('does not notify when no listed weekday falls inside the selectable window', async () => {
      const alert = alertFor().withWeeklyPreference(['sunday'], '14:00', '16:00').build();
      alertRepo.seed(alert);

      expect((await sweep()).notified).toBe(0);
    });
  });

  describe('the service booking window (M23-S33)', () => {
    const context = (selectableDays: number) => ({
      businessHours: FULL_WEEK_BUSINESS_HOURS,
      slotGranularityMinutes: 30 as const,
      serviceBufferMinutes: 0,
      selectableDays,
      bookingWindow: { minBookingAdvanceHours: 0, maxBookingAdvanceDays: 90 },
    });

    async function saveServiceWithPolicy(
      policy: Parameters<ServiceBuilder['withBookingPolicy']>[0],
    ): Promise<string> {
      const service = new ServiceBuilder()
        .withTenantId(TENANT_ID)
        .withDurationMinutes(60)
        .withBookingPolicy(policy)
        .build();
      await serviceRepo.save(service);
      return service.id;
    }

    it("never matches a date beyond the service's own maximum, even inside the tenant window", async () => {
      platformPort.seedAvailabilityAlertContext(TENANT_ID, context(60));
      const shortWindowId = await saveServiceWithPolicy({ maxBookingAdvanceDaysOverride: 7 });
      const alert = alertFor({ serviceId: shortWindowId })
        .withOneTimeRange(at(farMonday, '10:00'), at(farMonday, '12:00'))
        .build();
      alertRepo.seed(alert);

      expect((await sweep()).notified).toBe(0);
      expect(alert.status).toBe('ACTIVE');
    });

    it("drops a slot that starts inside the service's minimum notice", async () => {
      platformPort.seedAvailabilityAlertContext(TENANT_ID, context(60));
      const noticeId = await saveServiceWithPolicy({ minBookingAdvanceHoursOverride: 24 * 14 });
      const alert = alertFor({ serviceId: noticeId })
        .withOneTimeRange(at(monday, '10:00'), at(monday, '12:00'))
        .build();
      alertRepo.seed(alert);

      expect((await sweep()).notified).toBe(0);
      expect(alert.status).toBe('ACTIVE');
    });

    it('applies the tenant minimum notice to a service without an override', async () => {
      platformPort.seedAvailabilityAlertContext(TENANT_ID, {
        ...context(60),
        bookingWindow: { minBookingAdvanceHours: 24 * 14, maxBookingAdvanceDays: 90 },
      });
      const alert = alertFor().withOneTimeRange(at(monday, '10:00'), at(monday, '12:00')).build();
      alertRepo.seed(alert);

      expect((await sweep()).notified).toBe(0);
    });

    it('skips an alert whose service no longer exists', async () => {
      const alert = alertFor({ serviceId: '30000000-0000-4000-8000-0000000000ff' })
        .withOneTimeRange(at(monday, '10:00'), at(monday, '12:00'))
        .build();
      alertRepo.seed(alert);

      expect((await sweep()).notified).toBe(0);
    });
  });

  describe('the customer-selectable window', () => {
    it('never matches a date beyond what the booking page lets a customer pick', async () => {
      platformPort.seedAvailabilityAlertContext(TENANT_ID, {
        businessHours: FULL_WEEK_BUSINESS_HOURS,
        slotGranularityMinutes: 30,
        serviceBufferMinutes: 0,
        selectableDays: 14,
        bookingWindow: { minBookingAdvanceHours: 0, maxBookingAdvanceDays: 90 },
      });
      const alert = alertFor()
        .withOneTimeRange(at(farMonday, '10:00'), at(farMonday, '12:00'))
        .build();
      alertRepo.seed(alert);

      expect((await sweep()).notified).toBe(0);
      expect(alert.status).toBe('ACTIVE');
    });

    it('matches that date on the sweep once the window has rolled forward to it', async () => {
      platformPort.seedAvailabilityAlertContext(TENANT_ID, {
        businessHours: FULL_WEEK_BUSINESS_HOURS,
        slotGranularityMinutes: 30,
        serviceBufferMinutes: 0,
        selectableDays: 60,
        bookingWindow: { minBookingAdvanceHours: 0, maxBookingAdvanceDays: 90 },
      });
      const alert = alertFor()
        .withOneTimeRange(at(farMonday, '10:00'), at(farMonday, '12:00'))
        .build();
      alertRepo.seed(alert);

      expect((await sweep()).notified).toBe(1);
      expect(alert.status).toBe('NOTIFIED');
    });
  });

  describe('the day boundary', () => {
    it("follows the availability read's UTC date contract: late on a local evening the window already starts on the next UTC date", async () => {
      // Monday 22:00 in São Paulo is already Tuesday 01:00Z, and the availability read refuses any
      // date before the UTC today. The window therefore starts on Tuesday: no silent skip, no error.
      const mondayAlert = alertFor()
        .withOneTimeRange(at(monday, '10:00'), at(monday, '12:00'))
        .build();
      const tuesdayAlert = alertFor()
        .withOneTimeRange(at(tuesday, '10:00'), at(tuesday, '12:00'))
        .build();
      alertRepo.seed(mondayAlert);
      alertRepo.seed(tuesdayAlert);

      const result = await sweep(at(monday, '22:00'));

      expect(result.notified).toBe(1);
      expect(mondayAlert.status).toBe('ACTIVE');
      expect(tuesdayAlert.status).toBe('NOTIFIED');
    });

    it('a slot freed on a local day that is no longer selectable is left to the next sweep', async () => {
      const alert = alertFor().withOneTimeRange(at(monday, '10:00'), at(monday, '12:00')).build();
      alertRepo.seed(alert);

      const result = await useCase.execute({
        tenantId: TENANT_ID,
        correlationId: CORRELATION_ID,
        serviceIds: [serviceId],
        around: at(monday, '10:00'),
        now: at(monday, '22:00'),
      });

      expect(result.notified).toBe(0);
      expect(alert.status).toBe('ACTIVE');
    });
  });

  describe('a freed day (capacity-release trigger)', () => {
    it('re-checks only that day for the given services', async () => {
      const mondayAlert = alertFor()
        .withOneTimeRange(at(monday, '10:00'), at(monday, '12:00'))
        .build();
      const tuesdayAlert = alertFor()
        .withOneTimeRange(at(tuesday, '10:00'), at(tuesday, '12:00'))
        .build();
      alertRepo.seed(mondayAlert);
      alertRepo.seed(tuesdayAlert);

      const result = await useCase.execute({
        tenantId: TENANT_ID,
        correlationId: CORRELATION_ID,
        serviceIds: [serviceId],
        around: at(monday, '10:00'),
      });

      expect(result.notified).toBe(1);
      expect(mondayAlert.status).toBe('NOTIFIED');
      expect(tuesdayAlert.status).toBe('ACTIVE');
    });

    it('ignores a freed day outside the selectable window — the sweep picks it up later', async () => {
      const alert = alertFor()
        .withOneTimeRange(at(farMonday, '10:00'), at(farMonday, '12:00'))
        .build();
      alertRepo.seed(alert);

      const result = await useCase.execute({
        tenantId: TENANT_ID,
        correlationId: CORRELATION_ID,
        serviceIds: [serviceId],
        around: at(farMonday, '10:00'),
      });

      expect(result.notified).toBe(0);
      expect(alert.status).toBe('ACTIVE');
    });

    it('ignores a freed day that is already in the past', async () => {
      const alert = alertFor().withOneTimeRange(at(monday, '10:00'), at(monday, '12:00')).build();
      alertRepo.seed(alert);

      const result = await useCase.execute({
        tenantId: TENANT_ID,
        correlationId: CORRELATION_ID,
        serviceIds: [serviceId],
        around: new Date(Date.now() - 3 * DAY_MS),
      });

      expect(result.notified).toBe(0);
    });

    it("only considers the freed booking's own services", async () => {
      const otherService = new ServiceBuilder()
        .withTenantId(TENANT_ID)
        .withDurationMinutes(60)
        .build();
      await serviceRepo.save(otherService);
      const alert = alertFor({ serviceId: otherService.id })
        .withOneTimeRange(at(monday, '10:00'), at(monday, '12:00'))
        .build();
      alertRepo.seed(alert);

      const result = await useCase.execute({
        tenantId: TENANT_ID,
        correlationId: CORRELATION_ID,
        serviceIds: [serviceId],
        around: at(monday, '10:00'),
      });

      expect(result.notified).toBe(0);
      expect(alert.status).toBe('ACTIVE');
    });
  });

  describe('one notification per alert', () => {
    it('is idempotent: a second run, or a replayed event, notifies nobody again', async () => {
      alertRepo.seed(alertFor().withOneTimeRange(at(monday, '10:00'), at(monday, '12:00')).build());

      expect((await sweep()).notified).toBe(1);
      expect((await sweep()).notified).toBe(0);

      expect(alertRepo.attempts).toHaveLength(1);
      expect(published).toHaveLength(1);
    });

    it.each(['NOTIFIED', 'CANCELLED', 'EXPIRED'] as const)(
      'never matches a %s alert',
      async (status) => {
        const alert = alertFor()
          .withOneTimeRange(at(monday, '10:00'), at(monday, '12:00'))
          .withStatus(status)
          .build();
        alertRepo.seed(alert);

        expect((await sweep()).notified).toBe(0);
        expect(alert.status).toBe(status);
      },
    );

    it('never matches an ACTIVE alert already past its expiry (the expiry job has not run yet)', async () => {
      const alert = alertFor()
        .withOneTimeRange(at(monday, '10:00'), at(monday, '12:00'))
        .withExpiresAt(new Date(Date.now() - 1000))
        .build();
      alertRepo.seed(alert);

      expect((await sweep()).notified).toBe(0);
      expect(alert.status).toBe('ACTIVE');
    });

    it('treats a version conflict (a racing trigger got there first) as already handled', async () => {
      const conflicting = new ConflictingAlertRepository();
      const alert = alertFor().withOneTimeRange(at(monday, '10:00'), at(monday, '12:00')).build();
      conflicting.seed(alert);

      const result = await build(conflicting).execute({
        tenantId: TENANT_ID,
        correlationId: CORRELATION_ID,
        serviceIds: null,
        around: null,
      });

      expect(result.notified).toBe(0);
    });

    it('notifies each matching alert of the service, and shares one availability read per day', async () => {
      const first = alertFor().withOneTimeRange(at(monday, '10:00'), at(monday, '12:00')).build();
      const second = alertFor().withWeeklyPreference(['monday'], '13:00', '15:00').build();
      alertRepo.seed(first);
      alertRepo.seed(second);

      expect((await sweep()).notified).toBe(2);
      expect(first.status).toBe('NOTIFIED');
      expect(second.status).toBe('NOTIFIED');
    });
  });

  describe('preferred resource', () => {
    it('matches against that resource only — a busy preferred resource blocks the match', async () => {
      bookingPort.setSlots([
        { resourceId: locationId, startsAt: at(monday, '09:00'), endsAt: at(monday, '18:00') },
      ]);
      const alert = alertFor({ resourceId: locationId })
        .withOneTimeRange(at(monday, '10:00'), at(monday, '12:00'))
        .build();
      alertRepo.seed(alert);

      expect((await sweep()).notified).toBe(0);
    });

    it('matches when the preferred resource is free', async () => {
      const alert = alertFor({ resourceId: locationId })
        .withOneTimeRange(at(monday, '10:00'), at(monday, '12:00'))
        .build();
      alertRepo.seed(alert);

      expect((await sweep()).notified).toBe(1);
      expect(published[0].data).toMatchObject({ resourceId: locationId });
    });

    describe('a bundle service (several required resources)', () => {
      let bundleServiceId: string;
      let roomId: string;
      let equipmentId: string;

      beforeEach(async () => {
        const bundle = new ServiceBuilder()
          .withTenantId(TENANT_ID)
          .withDurationMinutes(60)
          .withResourceRequirements([
            ResourceRequirement.create({ type: ResourceType.ROOM, selectionMode: 'AUTO_ANY' }),
            ResourceRequirement.create({ type: ResourceType.EQUIPMENT, selectionMode: 'AUTO_ANY' }),
          ])
          .build();
        await serviceRepo.save(bundle);
        bundleServiceId = bundle.id;
        const room = new ResourceBuilder()
          .withTenantId(TENANT_ID)
          .withType(ResourceType.ROOM)
          .build();
        const equipment = new ResourceBuilder()
          .withTenantId(TENANT_ID)
          .withType(ResourceType.EQUIPMENT)
          .build();
        await resourceRepo.save(room);
        await resourceRepo.save(equipment);
        roomId = room.id;
        equipmentId = equipment.id;
      });

      it('never matches on the preferred resource alone: a free preferred resource does not make up for an occupied required room', async () => {
        bookingPort.setSlots([
          { resourceId: roomId, startsAt: at(monday, '09:00'), endsAt: at(monday, '18:00') },
        ]);
        const alert = alertFor({ serviceId: bundleServiceId, resourceId: equipmentId })
          .withOneTimeRange(at(monday, '10:00'), at(monday, '12:00'))
          .build();
        alertRepo.seed(alert);

        expect((await sweep()).notified).toBe(0);
        expect(alert.status).toBe('ACTIVE');
      });

      it('matches when every required resource, the preferred one included, is free', async () => {
        const alert = alertFor({ serviceId: bundleServiceId, resourceId: equipmentId })
          .withOneTimeRange(at(monday, '10:00'), at(monday, '12:00'))
          .build();
        alertRepo.seed(alert);

        expect((await sweep()).notified).toBe(1);
      });

      it('does not match when the preferred resource itself is occupied, though the room is free', async () => {
        bookingPort.setSlots([
          { resourceId: equipmentId, startsAt: at(monday, '09:00'), endsAt: at(monday, '18:00') },
        ]);
        const alert = alertFor({ serviceId: bundleServiceId, resourceId: equipmentId })
          .withOneTimeRange(at(monday, '10:00'), at(monday, '12:00'))
          .build();
        alertRepo.seed(alert);

        expect((await sweep()).notified).toBe(0);
      });
    });

    it('skips an alert whose preferred resource no longer exists, without failing the run', async () => {
      const gone = alertFor({ resourceId: '00000000-0000-7000-8000-0000000000aa' })
        .withOneTimeRange(at(monday, '10:00'), at(monday, '12:00'))
        .build();
      const healthy = alertFor().withOneTimeRange(at(monday, '10:00'), at(monday, '12:00')).build();
      alertRepo.seed(gone);
      alertRepo.seed(healthy);

      expect((await sweep()).notified).toBe(1);
      expect(gone.status).toBe('ACTIVE');
      expect(healthy.status).toBe('NOTIFIED');
    });
  });

  describe('failure handling', () => {
    it('skips a deactivated service without failing the run', async () => {
      const inactive = new ServiceBuilder()
        .withTenantId(TENANT_ID)
        .withDurationMinutes(60)
        .withIsActive(false)
        .build();
      await serviceRepo.save(inactive);
      const alert = alertFor({ serviceId: inactive.id })
        .withOneTimeRange(at(monday, '10:00'), at(monday, '12:00'))
        .build();
      alertRepo.seed(alert);

      const result = await sweep();

      expect(result.notified).toBe(0);
      expect(alert.status).toBe('ACTIVE');
    });

    it('returns 0 when there are no ACTIVE alerts at all', async () => {
      expect(await sweep()).toEqual({ notified: 0 });
    });
  });

  describe('cost', () => {
    it('never reads the tenant context when the services have no ACTIVE alert (the common cancellation)', async () => {
      const contextRead = jest.spyOn(platformPort, 'getAvailabilityAlertContext');

      const result = await useCase.execute({
        tenantId: TENANT_ID,
        correlationId: CORRELATION_ID,
        serviceIds: [serviceId],
        around: at(monday, '10:00'),
      });

      expect(result.notified).toBe(0);
      expect(contextRead).not.toHaveBeenCalled();
    });

    it('reads the tenant context once per run, however many services and alerts there are', async () => {
      const otherService = new ServiceBuilder()
        .withTenantId(TENANT_ID)
        .withDurationMinutes(60)
        .build();
      await serviceRepo.save(otherService);
      alertRepo.seed(alertFor().withOneTimeRange(at(monday, '10:00'), at(monday, '12:00')).build());
      alertRepo.seed(
        alertFor({ serviceId: otherService.id })
          .withOneTimeRange(at(monday, '10:00'), at(monday, '12:00'))
          .build(),
      );
      const contextRead = jest.spyOn(platformPort, 'getAvailabilityAlertContext');

      expect((await sweep()).notified).toBe(2);
      expect(contextRead).toHaveBeenCalledTimes(1);
    });
  });

  describe('tenant isolation', () => {
    it("never matches another tenant's alert, even for the same service id", async () => {
      const foreign = alertFor({ tenantId: OTHER_TENANT_ID })
        .withOneTimeRange(at(monday, '10:00'), at(monday, '12:00'))
        .build();
      alertRepo.seed(foreign);

      const result = await sweep();

      expect(result.notified).toBe(0);
      expect(foreign.status).toBe('ACTIVE');
      expect(alertRepo.attempts).toEqual([]);
    });
  });
});
