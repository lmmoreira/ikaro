import { InMemoryResourceOccupancyRepository } from '../../../../test/repositories/booking/in-memory-resource-occupancy.repository';
import { createAutoBookingResourceFixtures } from '../../../../test/repositories/booking/auto-degenerate-fixtures';
import { InMemoryTenantLock } from '../../../../test/infrastructure/in-memory-tenant-lock';
import { InMemoryEventBus } from '../../../../test/infrastructure/in-memory-event-bus';
import { InMemoryTransactionManager } from '../../../../test/infrastructure/in-memory-transaction-manager';
import { InMemoryBookingRepository } from '../../../../test/repositories/booking/in-memory-booking.repository';
import { InMemoryBookingQuoteRevisionRepository } from '../../../../test/repositories/booking/in-memory-booking-quote-revision.repository';
import { BookingBuilder, BookingLineBuilder } from '../../../../test/builders/booking/index';
import { ServiceBuilder } from '../../../../test/builders/booking/service.builder';
import { futureDate, pastDate } from '../../../../test/utils/date-helpers';
import { Money } from '../../../../shared/value-objects/money';
import { BookingStatus } from '../../domain/booking.aggregate';
import { ResourceType } from '../../domain/resource.types';
import { AvailabilityService } from '../../domain/services/availability.service';
import {
  BookingForbiddenError,
  BookingNotFoundError,
  BookingScheduledInPastError,
  BookingSlotUnavailableError,
  BookingTooFarAheadError,
  BookingTooSoonError,
  RescheduleWindowExpiredError,
} from '../../domain/errors/booking-domain.error';
import { BookingSlotConflictService } from '../services/booking-slot-conflict.service';
import { BookingQuoteService } from '../services/booking-quote.service';
import { RescheduleBookingAsCustomerUseCase } from './reschedule-booking-as-customer.use-case';

const TENANT_A = '10000000-0000-4000-8000-000000000601';
const TENANT_B = '10000000-0000-4000-8000-000000000602';
const CUSTOMER_ID = '20000000-0000-4000-8000-000000000601';
const OTHER_CUSTOMER_ID = '20000000-0000-4000-8000-000000000602';
const CORRELATION_ID = 'corr-reschedule-customer-test';
const DEFAULT_WINDOW_HOURS = 48;

const futureSlot = `${futureDate(5)}T10:00:00.000Z`;
const newFutureSlot = `${futureDate(6)}T14:00:00.000Z`;

describe('RescheduleBookingAsCustomerUseCase', () => {
  let bookingRepo: InMemoryBookingRepository;
  let fixtures: ReturnType<typeof createAutoBookingResourceFixtures>;
  let occupancyRepo: InMemoryResourceOccupancyRepository;
  let quoteRevisionRepo: InMemoryBookingQuoteRevisionRepository;
  let eventBus: InMemoryEventBus;
  let useCase: RescheduleBookingAsCustomerUseCase;

  beforeEach(() => {
    eventBus = new InMemoryEventBus();
    bookingRepo = new InMemoryBookingRepository(eventBus);
    fixtures = createAutoBookingResourceFixtures();
    occupancyRepo = new InMemoryResourceOccupancyRepository();
    quoteRevisionRepo = new InMemoryBookingQuoteRevisionRepository();
    useCase = new RescheduleBookingAsCustomerUseCase(
      bookingRepo,
      fixtures.serviceRepo,
      fixtures.resourceRepo,
      occupancyRepo,
      quoteRevisionRepo,
      new AvailabilityService(),
      new BookingSlotConflictService(occupancyRepo, new InMemoryTenantLock()),
      new BookingQuoteService(),
      new InMemoryTransactionManager(),
    );
  });

  function execute(overrides: Partial<Parameters<typeof useCase.execute>[0]> = {}) {
    return useCase.execute({
      bookingId: overrides.bookingId!,
      scheduledAt: newFutureSlot,
      tenantId: TENANT_A,
      customerId: CUSTOMER_ID,
      correlationId: CORRELATION_ID,
      timezone: 'America/Sao_Paulo',
      tenantDefaultRescheduleWindowHours: DEFAULT_WINDOW_HOURS,
      tenantBookingWindow: { minBookingAdvanceHours: 0, maxBookingAdvanceDays: 90 },
      ...overrides,
    });
  }

  describe('happy path', () => {
    it('reschedules the caller-owned APPROVED booking and returns updated scheduledAt', async () => {
      const booking = new BookingBuilder()
        .withTenantId(TENANT_A)
        .withStatus(BookingStatus.APPROVED)
        .withScheduledAt(new Date(futureSlot))
        .withCustomerId(CUSTOMER_ID)
        .build();
      await bookingRepo.save(booking);

      const result = await execute({ bookingId: booking.id });

      expect(result.bookingId).toBe(booking.id);
      expect(result.status).toBe(BookingStatus.APPROVED);
      expect(result.scheduledAt).toBe(new Date(newFutureSlot).toISOString());
      expect(result.quoteRevision).toBeUndefined();
    });

    it('publishes BookingRescheduled with isBusiness=false and rescheduledBy=customerId', async () => {
      const booking = new BookingBuilder()
        .withTenantId(TENANT_A)
        .withStatus(BookingStatus.APPROVED)
        .withScheduledAt(new Date(futureSlot))
        .withCustomerId(CUSTOMER_ID)
        .build();
      await bookingRepo.save(booking);

      await execute({ bookingId: booking.id });

      expect(eventBus.published).toHaveLength(1);
      const data = eventBus.published[0].data as { rescheduledBy: string; isBusiness: boolean };
      expect(data.rescheduledBy).toBe(CUSTOMER_ID);
      expect(data.isBusiness).toBe(false);
    });
  });

  describe('ownership', () => {
    it('throws BookingForbiddenError when the booking belongs to another customer', async () => {
      const booking = new BookingBuilder()
        .withTenantId(TENANT_A)
        .withStatus(BookingStatus.APPROVED)
        .withScheduledAt(new Date(futureSlot))
        .withCustomerId(OTHER_CUSTOMER_ID)
        .build();
      await bookingRepo.save(booking);

      await expect(execute({ bookingId: booking.id })).rejects.toThrow(BookingForbiddenError);
    });
  });

  describe('reschedule-window eligibility (UC-069)', () => {
    it('throws RescheduleWindowExpiredError when inside the tenant default window', async () => {
      const nearFuture = new Date(Date.now() + 24 * 3_600_000);
      const booking = new BookingBuilder()
        .withTenantId(TENANT_A)
        .withStatus(BookingStatus.APPROVED)
        .withScheduledAt(nearFuture)
        .withCustomerId(CUSTOMER_ID)
        .build();
      await bookingRepo.save(booking);

      await expect(execute({ bookingId: booking.id })).rejects.toThrow(
        RescheduleWindowExpiredError,
      );
    });

    it('uses the per-service rescheduleWindowHoursOverride instead of the tenant default when set', async () => {
      const serviceId = '30000000-0000-4000-8000-000000000601';
      const service = new ServiceBuilder()
        .withId(serviceId)
        .withTenantId(TENANT_A)
        .withBookingPolicy({ rescheduleWindowHoursOverride: 1 })
        .build();
      await fixtures.serviceRepo.save(service);
      const line = new BookingLineBuilder().withServiceId(serviceId).build();
      // 24h out: outside the tenant's 48h default, but inside the service's 1h override.
      const nearFuture = new Date(Date.now() + 24 * 3_600_000);
      const booking = new BookingBuilder()
        .withTenantId(TENANT_A)
        .withStatus(BookingStatus.APPROVED)
        .withScheduledAt(nearFuture)
        .withCustomerId(CUSTOMER_ID)
        .withLines([line])
        .build();
      await bookingRepo.save(booking);

      await expect(execute({ bookingId: booking.id })).resolves.toBeDefined();
    });
  });

  describe('quote revisions (M23 Cluster 3)', () => {
    it('records a booking_quote_revisions row when durationMinutes changes the price', async () => {
      const serviceId = '30000000-0000-4000-8000-000000000602';
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
        .withCustomerId(CUSTOMER_ID)
        .withLines([line])
        .withTotalDurationMins(30)
        .withTotalPrice(Money.from(50, 'BRL'))
        .build();
      await bookingRepo.save(booking);

      const result = await execute({ bookingId: booking.id, durationMinutes: 90 });

      expect(result.quoteRevision).toEqual({
        revisionNo: 1,
        amount: { amount: '150.00', currency: 'BRL' },
      });
      const saved = await bookingRepo.findById(booking.id, TENANT_A);
      expect(saved!.lines[0].durationMinsAtBooking).toBe(90);
    });
  });

  describe('slot conflict', () => {
    it('throws BookingSlotUnavailableError when the new slot conflicts with another booking, original stays intact', async () => {
      const booking = new BookingBuilder()
        .withTenantId(TENANT_A)
        .withStatus(BookingStatus.APPROVED)
        .withScheduledAt(new Date(futureSlot))
        .withCustomerId(CUSTOMER_ID)
        .withTotalDurationMins(30)
        .build();
      await bookingRepo.save(booking);

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

      await expect(execute({ bookingId: booking.id })).rejects.toThrow(BookingSlotUnavailableError);

      const saved = await bookingRepo.findById(booking.id, TENANT_A);
      expect(saved!.scheduledAt.toISOString()).toBe(new Date(futureSlot).toISOString());
    });
  });

  describe('booking window (M23-S33)', () => {
    async function saveApprovedBooking(lines?: ReturnType<BookingLineBuilder['build']>[]) {
      const builder = new BookingBuilder()
        .withTenantId(TENANT_A)
        .withStatus(BookingStatus.APPROVED)
        .withScheduledAt(new Date(futureSlot))
        .withCustomerId(CUSTOMER_ID);
      const booking = (lines ? builder.withLines(lines) : builder).build();
      await bookingRepo.save(booking);
      return booking;
    }

    it('throws BookingTooFarAheadError for a new start beyond the tenant maximum', async () => {
      const booking = await saveApprovedBooking();

      await expect(
        execute({ bookingId: booking.id, scheduledAt: `${futureDate(120)}T10:00:00.000Z` }),
      ).rejects.toThrow(BookingTooFarAheadError);
    });

    it('throws BookingTooSoonError for a new start inside the minimum notice', async () => {
      const booking = await saveApprovedBooking();

      await expect(
        execute({
          bookingId: booking.id,
          tenantBookingWindow: { minBookingAdvanceHours: 24 * 10, maxBookingAdvanceDays: 90 },
        }),
      ).rejects.toThrow(BookingTooSoonError);
    });

    it('honours a per-service maximum tighter than the tenant maximum', async () => {
      const serviceId = '30000000-0000-4000-8000-000000000602';
      await fixtures.serviceRepo.save(
        new ServiceBuilder()
          .withId(serviceId)
          .withTenantId(TENANT_A)
          .withBookingPolicy({ maxBookingAdvanceDaysOverride: 3 })
          .build(),
      );
      const booking = await saveApprovedBooking([
        new BookingLineBuilder().withServiceId(serviceId).build(),
      ]);

      await expect(execute({ bookingId: booking.id })).rejects.toThrow(BookingTooFarAheadError);
    });

    it('allows a new start inside the window', async () => {
      const booking = await saveApprovedBooking();

      await expect(execute({ bookingId: booking.id })).resolves.toBeDefined();
    });
  });

  describe('error cases', () => {
    it('throws BookingNotFoundError when booking does not exist', async () => {
      await expect(execute({ bookingId: '00000000-0000-4000-8000-000000000000' })).rejects.toThrow(
        BookingNotFoundError,
      );
    });

    it('throws BookingScheduledInPastError when scheduledAt is in the past', async () => {
      const booking = new BookingBuilder()
        .withTenantId(TENANT_A)
        .withStatus(BookingStatus.APPROVED)
        .withScheduledAt(new Date(futureSlot))
        .withCustomerId(CUSTOMER_ID)
        .build();
      await bookingRepo.save(booking);

      await expect(
        execute({ bookingId: booking.id, scheduledAt: `${pastDate(1)}T10:00:00.000Z` }),
      ).rejects.toThrow(BookingScheduledInPastError);
    });

    it('tenant isolation: cannot reschedule a booking from another tenant', async () => {
      const booking = new BookingBuilder()
        .withTenantId(TENANT_B)
        .withStatus(BookingStatus.APPROVED)
        .withScheduledAt(new Date(futureSlot))
        .withCustomerId(CUSTOMER_ID)
        .build();
      await bookingRepo.save(booking);

      await expect(execute({ bookingId: booking.id })).rejects.toThrow(BookingNotFoundError);
    });
  });
});
