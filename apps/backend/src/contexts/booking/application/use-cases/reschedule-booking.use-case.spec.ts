import { InMemoryBookingAvailabilityPort } from '../../../../test/infrastructure/in-memory-booking-availability';
import { InMemoryEventBus } from '../../../../test/infrastructure/in-memory-event-bus';
import { InMemoryTransactionManager } from '../../../../test/infrastructure/in-memory-transaction-manager';
import { InMemoryBookingRepository } from '../../../../test/repositories/booking/in-memory-booking.repository';
import { BookingBuilder } from '../../../../test/builders/booking/index';
import { futureDate, pastDate } from '../../../../test/utils/date-helpers';
import { BookingStatus } from '../../domain/booking.aggregate';
import {
  BookingNotFoundError,
  BookingScheduledInPastError,
  BookingSlotUnavailableError,
  InvalidBookingTransitionError,
} from '../../domain/errors/booking-domain.error';
import { BookingSlotConflictService } from '../services/booking-slot-conflict.service';
import { RescheduleBookingUseCase } from './reschedule-booking.use-case';

const TENANT_A = '10000000-0000-4000-8000-000000000501';
const TENANT_B = '10000000-0000-4000-8000-000000000502';
const STAFF_ID = '20000000-0000-4000-8000-000000000501';
const CORRELATION_ID = 'corr-reschedule-test';

const futureSlot = `${futureDate(5)}T10:00:00.000Z`;
const newFutureSlot = `${futureDate(6)}T14:00:00.000Z`;

describe('RescheduleBookingUseCase', () => {
  let bookingRepo: InMemoryBookingRepository;
  let availabilityPort: InMemoryBookingAvailabilityPort;
  let eventBus: InMemoryEventBus;
  let useCase: RescheduleBookingUseCase;

  beforeEach(() => {
    bookingRepo = new InMemoryBookingRepository();
    availabilityPort = new InMemoryBookingAvailabilityPort();
    eventBus = new InMemoryEventBus();
    const slotConflictService = new BookingSlotConflictService(availabilityPort);
    useCase = new RescheduleBookingUseCase(
      bookingRepo,
      slotConflictService,
      new InMemoryTransactionManager(),
      eventBus,
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
      });

      expect(result.bookingId).toBe(booking.id);
      expect(result.status).toBe(BookingStatus.APPROVED);
      expect(result.scheduledAt).toBe(new Date(newFutureSlot).toISOString());
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
      });

      const saved = await bookingRepo.findById(booking.id, TENANT_A);
      expect(saved!.adminNotes).toBe('Customer requested earlier slot');
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
      });

      expect(eventBus.published).toHaveLength(1);
      expect(eventBus.published[0].eventName).toBe('BookingRescheduled');
      const data = eventBus.published[0].data as {
        previousSlot: { startTime: string; endTime: string };
        newSlot: { startTime: string; endTime: string };
        rescheduledBy: string;
      };
      expect(data.previousSlot.startTime).toBe(original.toISOString());
      expect(data.newSlot.startTime).toBe(new Date(newFutureSlot).toISOString());
      expect(data.rescheduledBy).toBe(STAFF_ID);
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
      const conflictAt = new Date(newFutureSlot);
      availabilityPort.setSlots([
        { id: 'other-booking-id', scheduledAt: conflictAt, totalDurationMins: 60 },
      ]);

      await expect(
        useCase.execute({
          bookingId: booking.id,
          scheduledAt: newFutureSlot,
          tenantId: TENANT_A,
          staffId: STAFF_ID,
          correlationId: CORRELATION_ID,
          timezone: 'America/Sao_Paulo',
        }),
      ).rejects.toThrow(BookingSlotUnavailableError);
    });

    it('does not self-conflict when new slot overlaps the original slot on the same day', async () => {
      const original = new Date(`${futureDate(5)}T10:00:00.000Z`);
      const overlapping = `${futureDate(5)}T10:15:00.000Z`;
      const booking = new BookingBuilder()
        .withTenantId(TENANT_A)
        .withStatus(BookingStatus.APPROVED)
        .withScheduledAt(original)
        .withTotalDurationMins(60)
        .build();
      await bookingRepo.save(booking);

      // the booking itself appears in the availability check at its original slot
      availabilityPort.setSlots([{ id: booking.id, scheduledAt: original, totalDurationMins: 60 }]);

      await expect(
        useCase.execute({
          bookingId: booking.id,
          scheduledAt: overlapping,
          tenantId: TENANT_A,
          staffId: STAFF_ID,
          correlationId: CORRELATION_ID,
          timezone: 'America/Sao_Paulo',
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
        }),
      ).rejects.toThrow(BookingNotFoundError);
    });
  });
});
