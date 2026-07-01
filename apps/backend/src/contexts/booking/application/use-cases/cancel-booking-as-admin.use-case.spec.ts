import { InMemoryEventBus } from '../../../../test/infrastructure/in-memory-event-bus';
import { InMemoryTransactionManager } from '../../../../test/infrastructure/in-memory-transaction-manager';
import { InMemoryBookingRepository } from '../../../../test/repositories/booking/in-memory-booking.repository';
import { BookingBuilder } from '../../../../test/builders/booking/index';
import { BookingStatus } from '../../domain/booking.aggregate';
import {
  BookingNotFoundError,
  InvalidBookingTransitionError,
} from '../../domain/errors/booking-domain.error';
import { CancelBookingAsAdminUseCase } from './cancel-booking-as-admin.use-case';

const TENANT_A = '10000000-0000-4000-8000-000000000401';
const TENANT_B = '10000000-0000-4000-8000-000000000402';
const STAFF_ID = '20000000-0000-4000-8000-000000000401';
const CORRELATION_ID = 'corr-cancel-admin-test';

const ctx = { tenantId: TENANT_A, staffId: STAFF_ID, correlationId: CORRELATION_ID };

describe('CancelBookingAsAdminUseCase', () => {
  let bookingRepo: InMemoryBookingRepository;
  let eventBus: InMemoryEventBus;
  let useCase: CancelBookingAsAdminUseCase;

  beforeEach(() => {
    bookingRepo = new InMemoryBookingRepository();
    eventBus = new InMemoryEventBus();
    useCase = new CancelBookingAsAdminUseCase(
      bookingRepo,
      new InMemoryTransactionManager(),
      eventBus,
    );
  });

  describe('cancelling a PENDING booking', () => {
    it('cancels the booking and returns CANCELLED status', async () => {
      const booking = new BookingBuilder().withTenantId(TENANT_A).build();
      await bookingRepo.save(booking);

      const result = await useCase.execute({ bookingId: booking.id, ...ctx });

      expect(result.status).toBe(BookingStatus.CANCELLED);
      expect(result.bookingId).toBe(booking.id);
    });

    it('persists CANCELLED status and sets cancelledBy + cancelledAt', async () => {
      const booking = new BookingBuilder().withTenantId(TENANT_A).build();
      await bookingRepo.save(booking);

      await useCase.execute({ bookingId: booking.id, ...ctx });

      const saved = await bookingRepo.findById(booking.id, TENANT_A);
      expect(saved!.status).toBe(BookingStatus.CANCELLED);
      expect(saved!.cancelledBy).toBe(STAFF_ID);
      expect(saved!.cancelledAt).not.toBeNull();
    });
  });

  describe('cancelling an APPROVED booking', () => {
    it('cancels an APPROVED booking scheduled in 1 hour — no window constraint', async () => {
      const nearFuture = new Date(Date.now() + 60 * 60_000);
      const booking = new BookingBuilder()
        .withTenantId(TENANT_A)
        .withStatus(BookingStatus.APPROVED)
        .withScheduledAt(nearFuture)
        .build();
      await bookingRepo.save(booking);

      const result = await useCase.execute({ bookingId: booking.id, ...ctx });

      expect(result.status).toBe(BookingStatus.CANCELLED);
    });
  });

  describe('cancelling an INFO_REQUESTED booking', () => {
    it('cancels an INFO_REQUESTED booking', async () => {
      const booking = new BookingBuilder()
        .withTenantId(TENANT_A)
        .withStatus(BookingStatus.INFO_REQUESTED)
        .build();
      await bookingRepo.save(booking);

      const result = await useCase.execute({ bookingId: booking.id, ...ctx });

      expect(result.status).toBe(BookingStatus.CANCELLED);
    });
  });

  describe('BookingCancelled event', () => {
    it('publishes BookingCancelled with isBusiness=true', async () => {
      const booking = new BookingBuilder().withTenantId(TENANT_A).build();
      await bookingRepo.save(booking);

      await useCase.execute({ bookingId: booking.id, ...ctx });

      const events = eventBus.published;
      expect(events).toHaveLength(1);
      expect(events[0].eventName).toBe('BookingCancelled');
      const data = events[0].data as {
        isBusiness: boolean;
        cancelledBy: string;
        reason: string | null;
      };
      expect(data.isBusiness).toBe(true);
      expect(data.cancelledBy).toBe(STAFF_ID);
    });

    it('includes the reason in the event when provided', async () => {
      const booking = new BookingBuilder().withTenantId(TENANT_A).build();
      await bookingRepo.save(booking);

      await useCase.execute({ bookingId: booking.id, reason: 'Staff unavailable', ...ctx });

      const events = eventBus.published;
      const data = events[0].data as { reason: string | null };
      expect(data.reason).toBe('Staff unavailable');
    });

    it('sets reason to null in the event when no reason is provided', async () => {
      const booking = new BookingBuilder().withTenantId(TENANT_A).build();
      await bookingRepo.save(booking);

      await useCase.execute({ bookingId: booking.id, ...ctx });

      const events = eventBus.published;
      const data = events[0].data as { reason: string | null };
      expect(data.reason).toBeNull();
    });
  });

  describe('error cases', () => {
    it('throws BookingNotFoundError when booking does not exist', async () => {
      await expect(
        useCase.execute({ bookingId: '00000000-0000-4000-8000-000000000000', ...ctx }),
      ).rejects.toThrow(BookingNotFoundError);
    });

    it('throws InvalidBookingTransitionError when booking is COMPLETED', async () => {
      const booking = new BookingBuilder()
        .withTenantId(TENANT_A)
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
        .withStatus(BookingStatus.CANCELLED)
        .build();
      await bookingRepo.save(booking);

      await expect(useCase.execute({ bookingId: booking.id, ...ctx })).rejects.toThrow(
        InvalidBookingTransitionError,
      );
    });

    it('tenant isolation: cannot cancel a booking from another tenant', async () => {
      const booking = new BookingBuilder().withTenantId(TENANT_B).build();
      await bookingRepo.save(booking);

      await expect(useCase.execute({ bookingId: booking.id, ...ctx })).rejects.toThrow(
        BookingNotFoundError,
      );
    });
  });
});
