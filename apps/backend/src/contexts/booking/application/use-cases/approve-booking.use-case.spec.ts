import { InMemoryBookingAvailabilityPort } from '../../../../test/infrastructure/in-memory-booking-availability';
import { InMemoryEventBus } from '../../../../test/infrastructure/in-memory-event-bus';
import { InMemoryTransactionManager } from '../../../../test/infrastructure/in-memory-transaction-manager';
import { InMemoryBookingRepository } from '../../../../test/repositories/booking/in-memory-booking.repository';
import { BookingBuilder } from '../../../../test/builders/booking/index';
import { RequestContextBuilder } from '../../../../test/factories/request-context.factory';
import { futureDate } from '../../../../test/utils/date-helpers';
import { BookingStatus } from '../../domain/booking.aggregate';
import {
  BookingNotFoundError,
  BookingSlotUnavailableError,
  InvalidBookingTransitionError,
  BookingScheduledAtInvalidError,
  BookingScheduledInPastError,
} from '../../domain/errors/booking-domain.error';
import { BookingSlotConflictService } from '../services/booking-slot-conflict.service';
import { ApproveBookingUseCase } from './approve-booking.use-case';

const TENANT_A = '10000000-0000-4000-8000-000000000201';
const TENANT_B = '10000000-0000-4000-8000-000000000202';
const STAFF_ID = '20000000-0000-4000-8000-000000000201';
const CORRELATION_ID = 'corr-approve-test';

const scheduledAt = new Date(`${futureDate(2)}T13:00:00.000Z`);

describe('ApproveBookingUseCase', () => {
  describe('approve()', () => {
    let bookingRepo: InMemoryBookingRepository;
    let eventBus: InMemoryEventBus;
    let availabilityPort: InMemoryBookingAvailabilityPort;
    let useCase: ApproveBookingUseCase;

    beforeEach(() => {
      bookingRepo = new InMemoryBookingRepository();
      eventBus = new InMemoryEventBus();
      availabilityPort = new InMemoryBookingAvailabilityPort();
      const ctx = new RequestContextBuilder()
        .withTenantId(TENANT_A)
        .withCorrelationId(CORRELATION_ID)
        .withActorId(STAFF_ID)
        .withActorRole('MANAGER')
        .build();
      useCase = new ApproveBookingUseCase(
        ctx,
        bookingRepo,
        new BookingSlotConflictService(availabilityPort, ctx),
        new InMemoryTransactionManager(),
        eventBus,
      );
    });

    it('transitions PENDING → APPROVED and returns result', async () => {
      const booking = new BookingBuilder()
        .withTenantId(TENANT_A)
        .withScheduledAt(scheduledAt)
        .build();
      await bookingRepo.save(booking);

      const result = await useCase.execute({ bookingId: booking.id });

      expect(result.status).toBe(BookingStatus.APPROVED);
      expect(result.bookingId).toBe(booking.id);
      expect(result.approvedAt).toBeDefined();
    });

    it('transitions INFO_REQUESTED → APPROVED', async () => {
      const booking = new BookingBuilder()
        .withTenantId(TENANT_A)
        .withScheduledAt(scheduledAt)
        .withStatus(BookingStatus.INFO_REQUESTED)
        .build();
      await bookingRepo.save(booking);

      const result = await useCase.execute({ bookingId: booking.id });

      expect(result.status).toBe(BookingStatus.APPROVED);
    });

    it('persists the approved status to the repository', async () => {
      const booking = new BookingBuilder()
        .withTenantId(TENANT_A)
        .withScheduledAt(scheduledAt)
        .build();
      await bookingRepo.save(booking);

      await useCase.execute({ bookingId: booking.id });

      const saved = await bookingRepo.findById(booking.id, TENANT_A);
      expect(saved!.status).toBe(BookingStatus.APPROVED);
      expect(saved!.approvedBy).toBe(STAFF_ID);
      expect(saved!.approvedAt).not.toBeNull();
    });

    it('allows approving with an alternate scheduledAt after a slot conflict', async () => {
      const originalScheduledAt = new Date(`${futureDate(2)}T13:00:00.000Z`);
      const retryScheduledAt = new Date(`${futureDate(2)}T14:00:00.000Z`);
      const booking = new BookingBuilder()
        .withTenantId(TENANT_A)
        .withScheduledAt(originalScheduledAt)
        .build();
      await bookingRepo.save(booking);

      const result = await useCase.execute({
        bookingId: booking.id,
        scheduledAt: retryScheduledAt.toISOString(),
      });

      expect(result.status).toBe(BookingStatus.APPROVED);

      const saved = await bookingRepo.findById(booking.id, TENANT_A);
      expect(saved!.scheduledAt.toISOString()).toBe(retryScheduledAt.toISOString());
    });

    it('publishes BookingApproved event with serviceNameAtBooking in lineSummary', async () => {
      const booking = new BookingBuilder()
        .withTenantId(TENANT_A)
        .withScheduledAt(scheduledAt)
        .build();
      await bookingRepo.save(booking);

      await useCase.execute({ bookingId: booking.id });

      const events = eventBus.published;
      expect(events).toHaveLength(1);
      expect(events[0].eventName).toBe('BookingApproved');
      const data = events[0].data as { lineSummary: { serviceNameAtBooking: string }[] };
      expect(data.lineSummary[0].serviceNameAtBooking).toBeDefined();
    });

    it('throws BookingNotFoundError when booking does not exist', async () => {
      await expect(
        useCase.execute({ bookingId: '00000000-0000-4000-8000-000000000000' }),
      ).rejects.toThrow(BookingNotFoundError);
    });

    it('throws InvalidBookingTransitionError when booking is COMPLETED', async () => {
      const booking = new BookingBuilder()
        .withTenantId(TENANT_A)
        .withScheduledAt(scheduledAt)
        .withStatus(BookingStatus.COMPLETED)
        .build();
      await bookingRepo.save(booking);

      await expect(useCase.execute({ bookingId: booking.id })).rejects.toThrow(
        InvalidBookingTransitionError,
      );
    });

    it('throws InvalidBookingTransitionError when booking is REJECTED', async () => {
      const booking = new BookingBuilder()
        .withTenantId(TENANT_A)
        .withScheduledAt(scheduledAt)
        .withStatus(BookingStatus.REJECTED)
        .build();
      await bookingRepo.save(booking);

      await expect(useCase.execute({ bookingId: booking.id })).rejects.toThrow(
        InvalidBookingTransitionError,
      );
    });

    it('throws InvalidBookingTransitionError when booking is CANCELLED', async () => {
      const booking = new BookingBuilder()
        .withTenantId(TENANT_A)
        .withScheduledAt(scheduledAt)
        .withStatus(BookingStatus.CANCELLED)
        .build();
      await bookingRepo.save(booking);

      await expect(useCase.execute({ bookingId: booking.id })).rejects.toThrow(
        InvalidBookingTransitionError,
      );
    });

    it('throws BookingSlotUnavailableError when slot overlaps an approved booking', async () => {
      availabilityPort.setSlots([{ id: 'slot-test-id', scheduledAt, totalDurationMins: 60 }]);
      const booking = new BookingBuilder()
        .withTenantId(TENANT_A)
        .withScheduledAt(scheduledAt)
        .build();
      await bookingRepo.save(booking);

      await expect(useCase.execute({ bookingId: booking.id })).rejects.toThrow(
        BookingSlotUnavailableError,
      );
    });

    it('allows approval when existing slot is non-overlapping (adjacent)', async () => {
      const otherSlotAt = new Date(scheduledAt.getTime() + 30 * 60_000);
      availabilityPort.setSlots([
        { id: 'slot-test-id', scheduledAt: otherSlotAt, totalDurationMins: 30 },
      ]);
      const booking = new BookingBuilder()
        .withTenantId(TENANT_A)
        .withScheduledAt(scheduledAt)
        .build();
      await bookingRepo.save(booking);

      const result = await useCase.execute({ bookingId: booking.id });
      expect(result.status).toBe(BookingStatus.APPROVED);
    });

    it('throws BookingScheduledInPastError when retrying with a past scheduledAt', async () => {
      const booking = new BookingBuilder()
        .withTenantId(TENANT_A)
        .withScheduledAt(scheduledAt)
        .build();
      await bookingRepo.save(booking);

      const pastScheduledAt = new Date(Date.now() - 60_000).toISOString();

      await expect(
        useCase.execute({ bookingId: booking.id, scheduledAt: pastScheduledAt }),
      ).rejects.toThrow(BookingScheduledInPastError);
    });

    it('throws BookingScheduledAtInvalidError when scheduledAt is malformed', async () => {
      const booking = new BookingBuilder()
        .withTenantId(TENANT_A)
        .withScheduledAt(scheduledAt)
        .build();
      await bookingRepo.save(booking);

      await expect(
        useCase.execute({ bookingId: booking.id, scheduledAt: 'not-a-date' }),
      ).rejects.toThrow(BookingScheduledAtInvalidError);
    });

    it('tenant isolation: cannot approve booking from another tenant', async () => {
      const booking = new BookingBuilder()
        .withTenantId(TENANT_B)
        .withScheduledAt(scheduledAt)
        .build();
      await bookingRepo.save(booking);

      await expect(useCase.execute({ bookingId: booking.id })).rejects.toThrow(
        BookingNotFoundError,
      );
    });
  });
});
