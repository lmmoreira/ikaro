import { ScheduleClosureBuilder } from '../../../../test/builders/booking/schedule-closure.builder';
import { utcDateToLocalDate } from '../../../../shared/utils/calendar-date';
import {
  BookingOutsideBusinessHoursError,
  BookingSlotClosedError,
} from '../../domain/errors/booking-domain.error';
import { DEFAULT_TEST_BUSINESS_HOURS } from '../../../../test/utils/business-hours-fixtures';
import { InMemoryScheduleClosureRepository } from '../../../../test/repositories/booking/in-memory-schedule-closure.repository';
import { InMemoryScheduleOpeningRepository } from '../../../../test/repositories/booking/in-memory-schedule-opening.repository';
import { InMemoryFutureCommitmentExceptionRepository } from '../../../../test/repositories/booking/in-memory-future-commitment-exception.repository';
import { InMemoryResourceOccupancyRepository } from '../../../../test/repositories/booking/in-memory-resource-occupancy.repository';
import { createAutoBookingResourceFixtures } from '../../../../test/repositories/booking/auto-degenerate-fixtures';
import { InMemoryTenantLock } from '../../../../test/infrastructure/in-memory-tenant-lock';
import { InMemoryEventBus } from '../../../../test/infrastructure/in-memory-event-bus';
import { InMemoryTransactionManager } from '../../../../test/infrastructure/in-memory-transaction-manager';
import { InMemoryBookingRepository } from '../../../../test/repositories/booking/in-memory-booking.repository';
import { InMemoryBookingQuoteRevisionRepository } from '../../../../test/repositories/booking/in-memory-booking-quote-revision.repository';
import {
  BookingBuilder,
  BookingLineBuilder,
  FutureCommitmentExceptionBuilder,
} from '../../../../test/builders/booking/index';
import { ServiceBuilder } from '../../../../test/builders/booking/service.builder';
import { Money } from '../../../../shared/value-objects/money';
import { openSlotAt, pastDate } from '../../../../test/utils/date-helpers';
import { BookingStatus } from '../../domain/booking.aggregate';
import { ResourceType } from '../../domain/resource.types';
import { AvailabilityService } from '../../domain/services/availability.service';
import {
  BookingNotFoundError,
  BookingScheduledInPastError,
  BookingSlotUnavailableError,
  InvalidBookingTransitionError,
} from '../../domain/errors/booking-domain.error';
import { BookingSlotConflictService } from '../services/booking-slot-conflict.service';
import { BookingQuoteService } from '../services/booking-quote.service';
import { RescheduleBookingUseCase } from './reschedule-booking.use-case';

const TENANT_A = '10000000-0000-4000-8000-000000000501';
const TENANT_B = '10000000-0000-4000-8000-000000000502';
const STAFF_ID = '20000000-0000-4000-8000-000000000501';
const CORRELATION_ID = 'corr-reschedule-test';

const futureSlot = openSlotAt(5, 10);
const newFutureSlot = openSlotAt(6, 14);

describe('RescheduleBookingUseCase', () => {
  let bookingRepo: InMemoryBookingRepository;
  let fixtures: ReturnType<typeof createAutoBookingResourceFixtures>;
  let occupancyRepo: InMemoryResourceOccupancyRepository;
  let quoteRevisionRepo: InMemoryBookingQuoteRevisionRepository;
  let eventBus: InMemoryEventBus;
  let exceptionRepo: InMemoryFutureCommitmentExceptionRepository;
  let closureRepo: InMemoryScheduleClosureRepository;
  let openingRepo: InMemoryScheduleOpeningRepository;
  let useCase: RescheduleBookingUseCase;

  beforeEach(() => {
    eventBus = new InMemoryEventBus();
    bookingRepo = new InMemoryBookingRepository(eventBus);
    fixtures = createAutoBookingResourceFixtures();
    occupancyRepo = new InMemoryResourceOccupancyRepository();
    quoteRevisionRepo = new InMemoryBookingQuoteRevisionRepository();
    exceptionRepo = new InMemoryFutureCommitmentExceptionRepository();
    closureRepo = new InMemoryScheduleClosureRepository();
    openingRepo = new InMemoryScheduleOpeningRepository();
    useCase = new RescheduleBookingUseCase(
      bookingRepo,
      fixtures.serviceRepo,
      fixtures.resourceRepo,
      occupancyRepo,
      quoteRevisionRepo,
      closureRepo,
      openingRepo,
      new AvailabilityService(),
      new BookingSlotConflictService(occupancyRepo, new InMemoryTenantLock()),
      new BookingQuoteService(),
      new InMemoryTransactionManager(),
      exceptionRepo,
    );
  });

  describe('happy path', () => {
    it('reschedules an APPROVED booking to a free slot and returns updated scheduledAt', async () => {
      const booking = new BookingBuilder()
        .withTenantId(TENANT_A)
        .withStatus(BookingStatus.APPROVED)
        .withScheduledAt(new Date(futureSlot))
        .build();
      await bookingRepo.save(booking);

      const result = await useCase.execute({
        bookingId: booking.id,
        scheduledAt: newFutureSlot,
        tenantId: TENANT_A,
        staffId: STAFF_ID,
        correlationId: CORRELATION_ID,
        timezone: 'America/Sao_Paulo',
        businessHours: DEFAULT_TEST_BUSINESS_HOURS,
      });

      expect(result.bookingId).toBe(booking.id);
      expect(result.status).toBe(BookingStatus.APPROVED);
      expect(result.scheduledAt).toBe(new Date(newFutureSlot).toISOString());
    });

    it('closes the entries whose resource the booking no longer occupies and keeps the others (M23-S48)', async () => {
      const booking = new BookingBuilder()
        .withTenantId(TENANT_A)
        .withStatus(BookingStatus.APPROVED)
        .withScheduledAt(new Date(futureSlot))
        .build();
      await bookingRepo.save(booking);
      const locationId = fixtures.resourceRepo.ensureLocation(TENANT_A).id;
      const keptEntry = new FutureCommitmentExceptionBuilder()
        .withTenantId(TENANT_A)
        .withAffectedId(booking.id)
        .withSourceId(locationId)
        .build();
      const staleEntry = new FutureCommitmentExceptionBuilder()
        .withTenantId(TENANT_A)
        .withAffectedId(booking.id)
        .build();
      await exceptionRepo.save(keptEntry);
      await exceptionRepo.save(staleEntry);

      await useCase.execute({
        bookingId: booking.id,
        scheduledAt: newFutureSlot,
        tenantId: TENANT_A,
        staffId: STAFF_ID,
        correlationId: CORRELATION_ID,
        timezone: 'America/Sao_Paulo',
        businessHours: DEFAULT_TEST_BUSINESS_HOURS,
      });

      const kept = await exceptionRepo.findById(keptEntry.id, TENANT_A);
      expect(kept?.status).toBe('OPEN');
      const closed = await exceptionRepo.findById(staleEntry.id, TENANT_A);
      expect(closed?.status).toBe('DISMISSED');
      expect(closed?.resolutionReason).toBe('RESOURCE_NO_LONGER_USED');
      expect(closed?.resolvedByStaffId).toBeNull();
    });

    it('persists the new scheduledAt in the repository', async () => {
      const booking = new BookingBuilder()
        .withTenantId(TENANT_A)
        .withStatus(BookingStatus.APPROVED)
        .withScheduledAt(new Date(futureSlot))
        .build();
      await bookingRepo.save(booking);

      await useCase.execute({
        bookingId: booking.id,
        scheduledAt: newFutureSlot,
        tenantId: TENANT_A,
        staffId: STAFF_ID,
        correlationId: CORRELATION_ID,
        timezone: 'America/Sao_Paulo',
        businessHours: DEFAULT_TEST_BUSINESS_HOURS,
      });

      const saved = await bookingRepo.findById(booking.id, TENANT_A);
      expect(saved!.scheduledAt.toISOString()).toBe(new Date(newFutureSlot).toISOString());
    });

    it('persists optional adminNotes when provided', async () => {
      const booking = new BookingBuilder()
        .withTenantId(TENANT_A)
        .withStatus(BookingStatus.APPROVED)
        .withScheduledAt(new Date(futureSlot))
        .build();
      await bookingRepo.save(booking);

      await useCase.execute({
        bookingId: booking.id,
        scheduledAt: newFutureSlot,
        adminNotes: 'Customer requested earlier slot',
        tenantId: TENANT_A,
        staffId: STAFF_ID,
        correlationId: CORRELATION_ID,
        timezone: 'America/Sao_Paulo',
        businessHours: DEFAULT_TEST_BUSINESS_HOURS,
      });

      const saved = await bookingRepo.findById(booking.id, TENANT_A);
      expect(saved!.adminNotes).toBe('Customer requested earlier slot');
    });

    it('moves the occupancy row(s) to the new window (M22-S03)', async () => {
      const booking = new BookingBuilder()
        .withTenantId(TENANT_A)
        .withStatus(BookingStatus.APPROVED)
        .withScheduledAt(new Date(futureSlot))
        .withTotalDurationMins(30)
        .build();
      await bookingRepo.save(booking);
      const resource = fixtures.resourceRepo.ensureLocation(TENANT_A);
      await occupancyRepo.assign(
        TENANT_A,
        booking.lines[0].lineId,
        [
          {
            resourceId: resource.id,
            resourceType: ResourceType.LOCATION,
            resourceName: resource.name,
            legIndex: null,
            quantityPosition: null,
            selectionMode: 'NONE' as const,
            isBundleMember: false,
            gapMinutes: null,
            gapSource: null,
            startsAt: new Date(futureSlot),
            endsAt: new Date(new Date(futureSlot).getTime() + 30 * 60_000),
          },
        ],
        'COMMITTED',
        null,
      );

      await useCase.execute({
        bookingId: booking.id,
        scheduledAt: newFutureSlot,
        tenantId: TENANT_A,
        staffId: STAFF_ID,
        correlationId: CORRELATION_ID,
        timezone: 'America/Sao_Paulo',
        businessHours: DEFAULT_TEST_BUSINESS_HOURS,
      });

      // Old window is free again.
      const oldWindowConflicts = await occupancyRepo.findConflictingResourceIds(TENANT_A, [
        {
          resourceId: resource.id,
          startsAt: new Date(futureSlot),
          endsAt: new Date(new Date(futureSlot).getTime() + 30 * 60_000),
        },
      ]);
      expect(oldWindowConflicts).toEqual([]);
      // New window is occupied.
      const newWindowConflicts = await occupancyRepo.findConflictingResourceIds(TENANT_A, [
        {
          resourceId: resource.id,
          startsAt: new Date(newFutureSlot),
          endsAt: new Date(new Date(newFutureSlot).getTime() + 30 * 60_000),
        },
      ]);
      expect(newWindowConflicts).toEqual([resource.id]);
    });
  });

  describe('BookingRescheduled event', () => {
    it('publishes BookingRescheduled with previousSlot, newSlot and rescheduledBy', async () => {
      const original = new Date(futureSlot);
      const booking = new BookingBuilder()
        .withTenantId(TENANT_A)
        .withStatus(BookingStatus.APPROVED)
        .withScheduledAt(original)
        .withTotalDurationMins(30)
        .build();
      await bookingRepo.save(booking);

      await useCase.execute({
        bookingId: booking.id,
        scheduledAt: newFutureSlot,
        tenantId: TENANT_A,
        staffId: STAFF_ID,
        correlationId: CORRELATION_ID,
        timezone: 'America/Sao_Paulo',
        businessHours: DEFAULT_TEST_BUSINESS_HOURS,
      });

      expect(eventBus.published).toHaveLength(1);
      expect(eventBus.published[0].eventName).toBe('BookingRescheduled');
      const data = eventBus.published[0].data as {
        previousSlot: { startTime: string; endTime: string };
        newSlot: { startTime: string; endTime: string };
        rescheduledBy: string;
        isBusiness: boolean;
      };
      expect(data.previousSlot.startTime).toBe(original.toISOString());
      expect(data.newSlot.startTime).toBe(new Date(newFutureSlot).toISOString());
      expect(data.rescheduledBy).toBe(STAFF_ID);
      expect(data.isBusiness).toBe(true);
    });
  });

  describe('quote revisions (M23 Cluster 3)', () => {
    it('does not record a quote revision for a same-price, time-only reschedule', async () => {
      const booking = new BookingBuilder()
        .withTenantId(TENANT_A)
        .withStatus(BookingStatus.APPROVED)
        .withScheduledAt(new Date(futureSlot))
        .build();
      await bookingRepo.save(booking);

      const result = await useCase.execute({
        bookingId: booking.id,
        scheduledAt: newFutureSlot,
        tenantId: TENANT_A,
        staffId: STAFF_ID,
        correlationId: CORRELATION_ID,
        timezone: 'America/Sao_Paulo',
        businessHours: DEFAULT_TEST_BUSINESS_HOURS,
      });

      expect(result.quoteRevision).toBeUndefined();
      expect(await quoteRevisionRepo.findLatestRevisionNo(TENANT_A, booking.id)).toBe(0);
    });

    it('records a booking_quote_revisions row and returns quoteRevision when durationMinutes changes the price', async () => {
      const serviceId = '30000000-0000-4000-8000-000000000501';
      const service = new ServiceBuilder()
        .withId(serviceId)
        .withTenantId(TENANT_A)
        .withPrice(Money.from(50, 'BRL'))
        .withDurationMinutes(30)
        .withBookingPolicy({
          durationPolicy: 'CUSTOMER_SELECTED',
          durationMinMinutes: 30,
          durationMaxMinutes: 120,
          durationIncrementMinutes: 30,
          pricingPolicy: 'PER_TIME_INCREMENT',
          pricingIncrementMinutes: 30,
          pricePerIncrementAmount: 50,
        })
        .build();
      await fixtures.serviceRepo.save(service);

      const line = new BookingLineBuilder()
        .withServiceId(serviceId)
        .withPriceAtBooking(Money.from(50, 'BRL'))
        .withDurationMinsAtBooking(30)
        .build();
      const booking = new BookingBuilder()
        .withTenantId(TENANT_A)
        .withStatus(BookingStatus.APPROVED)
        .withScheduledAt(new Date(futureSlot))
        .withLines([line])
        .withTotalDurationMins(30)
        .withTotalPrice(Money.from(50, 'BRL'))
        .build();
      await bookingRepo.save(booking);

      const result = await useCase.execute({
        bookingId: booking.id,
        scheduledAt: newFutureSlot,
        durationMinutes: 90,
        tenantId: TENANT_A,
        staffId: STAFF_ID,
        correlationId: CORRELATION_ID,
        timezone: 'America/Sao_Paulo',
        businessHours: DEFAULT_TEST_BUSINESS_HOURS,
      });

      expect(result.quoteRevision).toEqual({
        revisionNo: 1,
        amount: { amount: '150.00', currency: 'BRL' },
      });
      expect(await quoteRevisionRepo.findLatestRevisionNo(TENANT_A, booking.id)).toBe(1);
      const saved = await bookingRepo.findById(booking.id, TENANT_A);
      expect(saved!.lines[0].durationMinsAtBooking).toBe(90);
    });
  });

  describe('slot conflict', () => {
    it('throws BookingSlotUnavailableError when new slot conflicts with another booking', async () => {
      const booking = new BookingBuilder()
        .withTenantId(TENANT_A)
        .withStatus(BookingStatus.APPROVED)
        .withScheduledAt(new Date(futureSlot))
        .withTotalDurationMins(30)
        .build();
      await bookingRepo.save(booking);

      // another booking occupies the new slot
      const resource = fixtures.resourceRepo.ensureLocation(TENANT_A);
      const conflictAt = new Date(newFutureSlot);
      occupancyRepo.seed(TENANT_A, 'other-line-id', {
        resourceId: resource.id,
        resourceType: ResourceType.LOCATION,
        resourceName: resource.name,
        legIndex: null,
        quantityPosition: null,
        selectionMode: 'NONE' as const,
        isBundleMember: false,
        gapMinutes: null,
        gapSource: null,
        startsAt: conflictAt,
        endsAt: new Date(conflictAt.getTime() + 60 * 60_000),
      });

      await expect(
        useCase.execute({
          bookingId: booking.id,
          scheduledAt: newFutureSlot,
          tenantId: TENANT_A,
          staffId: STAFF_ID,
          correlationId: CORRELATION_ID,
          timezone: 'America/Sao_Paulo',
          businessHours: DEFAULT_TEST_BUSINESS_HOURS,
        }),
      ).rejects.toThrow(BookingSlotUnavailableError);
    });

    it('does not self-conflict when new slot overlaps the original slot on the same day (UC-060 A2)', async () => {
      const original = new Date(futureSlot);
      const overlapping = new Date(original.getTime() + 15 * 60_000).toISOString();
      const booking = new BookingBuilder()
        .withTenantId(TENANT_A)
        .withStatus(BookingStatus.APPROVED)
        .withScheduledAt(original)
        .withTotalDurationMins(60)
        .build();
      await bookingRepo.save(booking);
      const resource = fixtures.resourceRepo.ensureLocation(TENANT_A);
      // the booking's own existing occupancy row, at its original window
      await occupancyRepo.assign(
        TENANT_A,
        booking.lines[0].lineId,
        [
          {
            resourceId: resource.id,
            resourceType: ResourceType.LOCATION,
            resourceName: resource.name,
            legIndex: null,
            quantityPosition: null,
            selectionMode: 'NONE' as const,
            isBundleMember: false,
            gapMinutes: null,
            gapSource: null,
            startsAt: original,
            endsAt: new Date(original.getTime() + 60 * 60_000),
          },
        ],
        'COMMITTED',
        null,
      );

      await expect(
        useCase.execute({
          bookingId: booking.id,
          scheduledAt: overlapping,
          tenantId: TENANT_A,
          staffId: STAFF_ID,
          correlationId: CORRELATION_ID,
          timezone: 'America/Sao_Paulo',
          businessHours: DEFAULT_TEST_BUSINESS_HOURS,
        }),
      ).resolves.toBeDefined();
    });
  });

  describe('error cases', () => {
    it('throws BookingNotFoundError when booking does not exist', async () => {
      await expect(
        useCase.execute({
          bookingId: '00000000-0000-4000-8000-000000000000',
          scheduledAt: newFutureSlot,
          tenantId: TENANT_A,
          staffId: STAFF_ID,
          correlationId: CORRELATION_ID,
          timezone: 'America/Sao_Paulo',
          businessHours: DEFAULT_TEST_BUSINESS_HOURS,
        }),
      ).rejects.toThrow(BookingNotFoundError);
    });

    it('throws BookingScheduledInPastError when scheduledAt is in the past', async () => {
      const booking = new BookingBuilder()
        .withTenantId(TENANT_A)
        .withStatus(BookingStatus.APPROVED)
        .withScheduledAt(new Date(futureSlot))
        .build();
      await bookingRepo.save(booking);

      await expect(
        useCase.execute({
          bookingId: booking.id,
          scheduledAt: `${pastDate(1)}T10:00:00.000Z`,
          tenantId: TENANT_A,
          staffId: STAFF_ID,
          correlationId: CORRELATION_ID,
          timezone: 'America/Sao_Paulo',
          businessHours: DEFAULT_TEST_BUSINESS_HOURS,
        }),
      ).rejects.toThrow(BookingScheduledInPastError);
    });

    it('throws InvalidBookingTransitionError when booking is PENDING (only APPROVED can be rescheduled)', async () => {
      const booking = new BookingBuilder()
        .withTenantId(TENANT_A)
        .withStatus(BookingStatus.PENDING)
        .withScheduledAt(new Date(futureSlot))
        .build();
      await bookingRepo.save(booking);

      await expect(
        useCase.execute({
          bookingId: booking.id,
          scheduledAt: newFutureSlot,
          tenantId: TENANT_A,
          staffId: STAFF_ID,
          correlationId: CORRELATION_ID,
          timezone: 'America/Sao_Paulo',
          businessHours: DEFAULT_TEST_BUSINESS_HOURS,
        }),
      ).rejects.toThrow(InvalidBookingTransitionError);
    });

    it('throws InvalidBookingTransitionError when booking is CANCELLED', async () => {
      const booking = new BookingBuilder()
        .withTenantId(TENANT_A)
        .withStatus(BookingStatus.CANCELLED)
        .withScheduledAt(new Date(futureSlot))
        .build();
      await bookingRepo.save(booking);

      await expect(
        useCase.execute({
          bookingId: booking.id,
          scheduledAt: newFutureSlot,
          tenantId: TENANT_A,
          staffId: STAFF_ID,
          correlationId: CORRELATION_ID,
          timezone: 'America/Sao_Paulo',
          businessHours: DEFAULT_TEST_BUSINESS_HOURS,
        }),
      ).rejects.toThrow(InvalidBookingTransitionError);
    });

    it('tenant isolation: cannot reschedule a booking from another tenant', async () => {
      const booking = new BookingBuilder()
        .withTenantId(TENANT_B)
        .withStatus(BookingStatus.APPROVED)
        .withScheduledAt(new Date(futureSlot))
        .build();
      await bookingRepo.save(booking);

      await expect(
        useCase.execute({
          bookingId: booking.id,
          scheduledAt: newFutureSlot,
          tenantId: TENANT_A,
          staffId: STAFF_ID,
          correlationId: CORRELATION_ID,
          timezone: 'America/Sao_Paulo',
          businessHours: DEFAULT_TEST_BUSINESS_HOURS,
        }),
      ).rejects.toThrow(BookingNotFoundError);
    });
  });

  describe('working hours and closures (TD50)', () => {
    const localDate = (instant: string) =>
      utcDateToLocalDate(new Date(instant), DEFAULT_TEST_BUSINESS_HOURS.timezone);

    async function approvedBooking() {
      const booking = new BookingBuilder()
        .withTenantId(TENANT_A)
        .withStatus(BookingStatus.APPROVED)
        .withScheduledAt(new Date(futureSlot))
        .withTotalDurationMins(30)
        .build();
      await bookingRepo.save(booking);
      return booking;
    }

    function reschedule(bookingId: string, scheduledAt: string) {
      return useCase.execute({
        bookingId,
        scheduledAt,
        tenantId: TENANT_A,
        staffId: STAFF_ID,
        correlationId: CORRELATION_ID,
        timezone: 'America/Sao_Paulo',
        businessHours: DEFAULT_TEST_BUSINESS_HOURS,
      });
    }

    async function expectUnchanged(bookingId: string) {
      const saved = await bookingRepo.findById(bookingId, TENANT_A);
      expect(saved!.scheduledAt.toISOString()).toBe(new Date(futureSlot).toISOString());
    }

    it('refuses a closed day for staff too (no exemption) and leaves the booking at its time', async () => {
      const booking = await approvedBooking();
      await closureRepo.save(
        new ScheduleClosureBuilder()
          .withTenantId(TENANT_A)
          .withDate(localDate(newFutureSlot))
          .build(),
      );

      await expect(reschedule(booking.id, newFutureSlot)).rejects.toBeInstanceOf(
        BookingSlotClosedError,
      );
      await expectUnchanged(booking.id);
    });

    it('refuses a start outside the working hours', async () => {
      const booking = await approvedBooking();

      await expect(reschedule(booking.id, openSlotAt(6, 20))).rejects.toBeInstanceOf(
        BookingOutsideBusinessHoursError,
      );
      await expectUnchanged(booking.id);
    });

    it('refuses a partial closure over the new window', async () => {
      const booking = await approvedBooking();
      await closureRepo.save(
        new ScheduleClosureBuilder()
          .withTenantId(TENANT_A)
          .withDate(localDate(newFutureSlot))
          .withStartTime('13:00')
          .withEndTime('16:00')
          .build(),
      );

      await expect(reschedule(booking.id, newFutureSlot)).rejects.toBeInstanceOf(
        BookingSlotClosedError,
      );
    });

    it('refuses a resource-scoped closure on the resource the booking needs', async () => {
      const booking = await approvedBooking();
      const resource = fixtures.resourceRepo.ensureLocation(TENANT_A);
      await closureRepo.save(
        new ScheduleClosureBuilder()
          .withTenantId(TENANT_A)
          .withResourceId(resource.id)
          .withDate(localDate(newFutureSlot))
          .build(),
      );

      await expect(reschedule(booking.id, newFutureSlot)).rejects.toBeInstanceOf(
        BookingSlotClosedError,
      );
    });

    it('reports the closure, not the conflict, when both apply (hours are checked before occupancy)', async () => {
      const booking = await approvedBooking();
      const resource = fixtures.resourceRepo.ensureLocation(TENANT_A);
      const conflictAt = new Date(newFutureSlot);
      occupancyRepo.seed(TENANT_A, 'other-line-id', {
        resourceId: resource.id,
        resourceType: ResourceType.LOCATION,
        resourceName: resource.name,
        legIndex: null,
        quantityPosition: null,
        selectionMode: 'NONE' as const,
        isBundleMember: false,
        gapMinutes: null,
        gapSource: null,
        startsAt: conflictAt,
        endsAt: new Date(conflictAt.getTime() + 60 * 60_000),
      });
      await closureRepo.save(
        new ScheduleClosureBuilder()
          .withTenantId(TENANT_A)
          .withDate(localDate(newFutureSlot))
          .build(),
      );

      await expect(reschedule(booking.id, newFutureSlot)).rejects.toBeInstanceOf(
        BookingSlotClosedError,
      );
    });

    it("moves a booking out of a day that has since been closed to an open day (the original day's closure is never consulted)", async () => {
      const booking = await approvedBooking();
      await closureRepo.save(
        new ScheduleClosureBuilder().withTenantId(TENANT_A).withDate(localDate(futureSlot)).build(),
      );

      const result = await reschedule(booking.id, newFutureSlot);

      expect(result.scheduledAt).toBe(new Date(newFutureSlot).toISOString());
    });

    it('reads closures and openings in four queries, one per table and scope', async () => {
      const booking = await approvedBooking();
      const spies = [
        jest.spyOn(closureRepo, 'findByTenantAndDateRange'),
        jest.spyOn(closureRepo, 'findByTenantAndResourcesAndDateRange'),
        jest.spyOn(openingRepo, 'findByTenantAndDateRange'),
        jest.spyOn(openingRepo, 'findByTenantAndResourcesAndDateRange'),
      ];

      await reschedule(booking.id, newFutureSlot);

      for (const spy of spies) expect(spy).toHaveBeenCalledTimes(1);
    });

    it("tenant isolation: another tenant's closure does not refuse the reschedule", async () => {
      const booking = await approvedBooking();
      await closureRepo.save(
        new ScheduleClosureBuilder()
          .withTenantId(TENANT_B)
          .withDate(localDate(newFutureSlot))
          .build(),
      );

      const result = await reschedule(booking.id, newFutureSlot);

      expect(result.scheduledAt).toBe(new Date(newFutureSlot).toISOString());
    });
  });
});
