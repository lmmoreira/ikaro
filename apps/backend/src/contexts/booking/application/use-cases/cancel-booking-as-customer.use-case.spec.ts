import { InMemoryEventBus } from '../../../../test/infrastructure/in-memory-event-bus';
import { InMemoryTransactionManager } from '../../../../test/infrastructure/in-memory-transaction-manager';
import { InMemoryBookingRepository } from '../../../../test/repositories/booking/in-memory-booking.repository';
import { BookingBuilder } from '../../../../test/builders/booking/index';
import { futureDate } from '../../../../test/utils/date-helpers';
import { BookingStatus } from '../../domain/booking.aggregate';
import {
  BookingNotFoundError,
  BookingForbiddenError,
  CancellationWindowExpiredError,
  InvalidBookingTransitionError,
} from '../../domain/errors/booking-domain.error';
import { CancelBookingAsCustomerUseCase } from './cancel-booking-as-customer.use-case';

const TENANT_A = '10000000-0000-4000-8000-000000000301';
const TENANT_B = '10000000-0000-4000-8000-000000000302';
const CUSTOMER_ID = '20000000-0000-4000-8000-000000000301';
const OTHER_CUSTOMER_ID = '20000000-0000-4000-8000-000000000302';
const CORRELATION_ID = 'corr-cancel-customer-test';

const ctx = {
  tenantId: TENANT_A,
  customerId: CUSTOMER_ID,
  correlationId: CORRELATION_ID,
  cancellationWindowHours: 48,
};

describe('CancelBookingAsCustomerUseCase', () => {
  let bookingRepo: InMemoryBookingRepository;
  let eventBus: InMemoryEventBus;
  let useCase: CancelBookingAsCustomerUseCase;

  beforeEach(() => {
    eventBus = new InMemoryEventBus();
    bookingRepo = new InMemoryBookingRepository(eventBus);
    useCase = new CancelBookingAsCustomerUseCase(bookingRepo, new InMemoryTransactionManager());
  });

  describe('cancelling an APPROVED booking', () => {
    it('cancels when scheduledAt is beyond the 48h window → CANCELLED', async () => {
      const scheduledAt = new Date(`${futureDate(10)}T13:00:00.000Z`);
      const booking = new BookingBuilder()
        .withTenantId(TENANT_A)
        .withCustomerId(CUSTOMER_ID)
        .withStatus(BookingStatus.APPROVED)
        .withScheduledAt(scheduledAt)
        .build();
      await bookingRepo.save(booking);

      const result = await useCase.execute({ bookingId: booking.id, ...ctx });

      expect(result.status).toBe(BookingStatus.CANCELLED);
      expect(result.bookingId).toBe(booking.id);
    });

    it('persists CANCELLED status and sets cancelledBy + cancelledAt', async () => {
      const scheduledAt = new Date(`${futureDate(10)}T13:00:00.000Z`);
      const booking = new BookingBuilder()
        .withTenantId(TENANT_A)
        .withCustomerId(CUSTOMER_ID)
        .withStatus(BookingStatus.APPROVED)
        .withScheduledAt(scheduledAt)
        .build();
      await bookingRepo.save(booking);

      await useCase.execute({ bookingId: booking.id, ...ctx });

      const saved = await bookingRepo.findById(booking.id, TENANT_A);
      expect(saved!.status).toBe(BookingStatus.CANCELLED);
      expect(saved!.cancelledBy).toBe(CUSTOMER_ID);
      expect(saved!.cancelledAt).not.toBeNull();
    });

    it('publishes BookingCancelled event with isBusiness=false', async () => {
      const scheduledAt = new Date(`${futureDate(10)}T13:00:00.000Z`);
      const booking = new BookingBuilder()
        .withTenantId(TENANT_A)
        .withCustomerId(CUSTOMER_ID)
        .withStatus(BookingStatus.APPROVED)
        .withScheduledAt(scheduledAt)
        .build();
      await bookingRepo.save(booking);

      await useCase.execute({ bookingId: booking.id, ...ctx });

      const events = eventBus.published;
      expect(events).toHaveLength(1);
      expect(events[0].eventName).toBe('BookingCancelled');
      const data = events[0].data as { isBusiness: boolean; cancelledBy: string };
      expect(data.isBusiness).toBe(false);
      expect(data.cancelledBy).toBe(CUSTOMER_ID);
    });

    it('throws CancellationWindowExpiredError when scheduledAt is inside the window', async () => {
      const scheduledAt = new Date(Date.now() + 60 * 60_000);
      const booking = new BookingBuilder()
        .withTenantId(TENANT_A)
        .withCustomerId(CUSTOMER_ID)
        .withStatus(BookingStatus.APPROVED)
        .withScheduledAt(scheduledAt)
        .build();
      await bookingRepo.save(booking);

      await expect(useCase.execute({ bookingId: booking.id, ...ctx })).rejects.toThrow(
        CancellationWindowExpiredError,
      );
    });

    it('respects a custom 24h cancellation window from tenant settings', async () => {
      // scheduled in 25h — outside a 24h window, should succeed
      const scheduledAt = new Date(Date.now() + 25 * 60 * 60_000);
      const booking = new BookingBuilder()
        .withTenantId(TENANT_A)
        .withCustomerId(CUSTOMER_ID)
        .withStatus(BookingStatus.APPROVED)
        .withScheduledAt(scheduledAt)
        .build();
      await bookingRepo.save(booking);

      const result = await useCase.execute({
        bookingId: booking.id,
        ...ctx,
        cancellationWindowHours: 24,
      });
      expect(result.status).toBe(BookingStatus.CANCELLED);
    });
  });

  describe('cancelling a PENDING booking', () => {
    it('cancels a PENDING booking with no time restriction', async () => {
      const scheduledAt = new Date(Date.now() + 30 * 60_000);
      const booking = new BookingBuilder()
        .withTenantId(TENANT_A)
        .withCustomerId(CUSTOMER_ID)
        .withScheduledAt(scheduledAt)
        .build();
      await bookingRepo.save(booking);

      const result = await useCase.execute({ bookingId: booking.id, ...ctx });

      expect(result.status).toBe(BookingStatus.CANCELLED);
    });
  });

  describe('cancelling an INFO_REQUESTED booking', () => {
    it('cancels an INFO_REQUESTED booking with no time restriction', async () => {
      const scheduledAt = new Date(Date.now() + 30 * 60_000);
      const booking = new BookingBuilder()
        .withTenantId(TENANT_A)
        .withCustomerId(CUSTOMER_ID)
        .withStatus(BookingStatus.INFO_REQUESTED)
        .withScheduledAt(scheduledAt)
        .build();
      await bookingRepo.save(booking);

      const result = await useCase.execute({ bookingId: booking.id, ...ctx });

      expect(result.status).toBe(BookingStatus.CANCELLED);
    });
  });

  describe('error cases', () => {
    it('throws BookingNotFoundError when booking does not exist', async () => {
      await expect(
        useCase.execute({ bookingId: '00000000-0000-4000-8000-000000000000', ...ctx }),
      ).rejects.toThrow(BookingNotFoundError);
    });

    it('throws BookingForbiddenError when caller is not the booking owner', async () => {
      const booking = new BookingBuilder()
        .withTenantId(TENANT_A)
        .withCustomerId(OTHER_CUSTOMER_ID)
        .build();
      await bookingRepo.save(booking);

      await expect(useCase.execute({ bookingId: booking.id, ...ctx })).rejects.toThrow(
        BookingForbiddenError,
      );
    });

    it('throws InvalidBookingTransitionError when booking is COMPLETED', async () => {
      const booking = new BookingBuilder()
        .withTenantId(TENANT_A)
        .withCustomerId(CUSTOMER_ID)
        .withStatus(BookingStatus.COMPLETED)
        .build();
      await bookingRepo.save(booking);

      await expect(useCase.execute({ bookingId: booking.id, ...ctx })).rejects.toThrow(
        InvalidBookingTransitionError,
      );
    });

    it('throws InvalidBookingTransitionError when booking is REJECTED', async () => {
      const booking = new BookingBuilder()
        .withTenantId(TENANT_A)
        .withCustomerId(CUSTOMER_ID)
        .withStatus(BookingStatus.REJECTED)
        .build();
      await bookingRepo.save(booking);

      await expect(useCase.execute({ bookingId: booking.id, ...ctx })).rejects.toThrow(
        InvalidBookingTransitionError,
      );
    });

    it('throws InvalidBookingTransitionError when booking is already CANCELLED', async () => {
      const booking = new BookingBuilder()
        .withTenantId(TENANT_A)
        .withCustomerId(CUSTOMER_ID)
        .withStatus(BookingStatus.CANCELLED)
        .build();
      await bookingRepo.save(booking);

      await expect(useCase.execute({ bookingId: booking.id, ...ctx })).rejects.toThrow(
        InvalidBookingTransitionError,
      );
    });

    it('tenant isolation: cannot cancel booking from another tenant', async () => {
      const booking = new BookingBuilder()
        .withTenantId(TENANT_B)
        .withCustomerId(CUSTOMER_ID)
        .build();
      await bookingRepo.save(booking);

      await expect(useCase.execute({ bookingId: booking.id, ...ctx })).rejects.toThrow(
        BookingNotFoundError,
      );
    });
  });
});
