import { InMemoryScheduleTenantSettingsPort } from '../../../../test/infrastructure/in-memory-schedule-tenant-settings';
import { InMemoryEventBus } from '../../../../test/infrastructure/in-memory-event-bus';
import { InMemoryTransactionManager } from '../../../../test/infrastructure/in-memory-transaction-manager';
import { InMemoryBookingRepository } from '../../../../test/repositories/booking/in-memory-booking.repository';
import { BookingBuilder } from '../../../../test/builders/booking/index';
import { TenantContextBuilder } from '../../../../test/factories/tenant-context.factory';
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

describe('CancelBookingAsCustomerUseCase', () => {
  let bookingRepo: InMemoryBookingRepository;
  let eventBus: InMemoryEventBus;
  let settingsPort: InMemoryScheduleTenantSettingsPort;
  let useCase: CancelBookingAsCustomerUseCase;

  beforeEach(() => {
    bookingRepo = new InMemoryBookingRepository();
    eventBus = new InMemoryEventBus();
    settingsPort = new InMemoryScheduleTenantSettingsPort();
    const ctx = new TenantContextBuilder()
      .withTenantId(TENANT_A)
      .withCorrelationId(CORRELATION_ID)
      .withActorId(CUSTOMER_ID)
      .withActorRole('CUSTOMER')
      .build();
    useCase = new CancelBookingAsCustomerUseCase(
      ctx,
      bookingRepo,
      settingsPort,
      new InMemoryTransactionManager(),
      eventBus,
    );
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

      const result = await useCase.execute({ bookingId: booking.id });

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

      await useCase.execute({ bookingId: booking.id });

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

      await useCase.execute({ bookingId: booking.id });

      const events = eventBus.published;
      expect(events).toHaveLength(1);
      expect(events[0].eventName).toBe('BookingCancelled');
      const data = events[0].data as { isBusiness: boolean; cancelledBy: string };
      expect(data.isBusiness).toBe(false);
      expect(data.cancelledBy).toBe(CUSTOMER_ID);
    });

    it('throws CancellationWindowExpiredError when scheduledAt is inside the window', async () => {
      // scheduled in 1h — inside the default 48h window
      const scheduledAt = new Date(Date.now() + 60 * 60_000);
      const booking = new BookingBuilder()
        .withTenantId(TENANT_A)
        .withCustomerId(CUSTOMER_ID)
        .withStatus(BookingStatus.APPROVED)
        .withScheduledAt(scheduledAt)
        .build();
      await bookingRepo.save(booking);

      await expect(useCase.execute({ bookingId: booking.id })).rejects.toThrow(
        CancellationWindowExpiredError,
      );
    });

    it('respects a custom 24h cancellation window from tenant settings', async () => {
      settingsPort.setBookingSettings(TENANT_A, {
        cancellation_window_hours: 24,
        auto_approve_enabled: false,
        min_booking_advance_hours: 0,
        max_booking_advance_days: 90,
        service_buffer_minutes: 60,
        slot_granularity_minutes: 30,
      });

      // scheduled in 25h — outside a 24h window, should succeed
      const scheduledAt = new Date(Date.now() + 25 * 60 * 60_000);
      const booking = new BookingBuilder()
        .withTenantId(TENANT_A)
        .withCustomerId(CUSTOMER_ID)
        .withStatus(BookingStatus.APPROVED)
        .withScheduledAt(scheduledAt)
        .build();
      await bookingRepo.save(booking);

      const result = await useCase.execute({ bookingId: booking.id });
      expect(result.status).toBe(BookingStatus.CANCELLED);
    });
  });

  describe('cancelling a PENDING booking', () => {
    it('cancels a PENDING booking with no time restriction', async () => {
      // scheduled in 30 minutes — inside any reasonable window, but PENDING so no check
      const scheduledAt = new Date(Date.now() + 30 * 60_000);
      const booking = new BookingBuilder()
        .withTenantId(TENANT_A)
        .withCustomerId(CUSTOMER_ID)
        .withScheduledAt(scheduledAt)
        .build();
      await bookingRepo.save(booking);

      const result = await useCase.execute({ bookingId: booking.id });

      expect(result.status).toBe(BookingStatus.CANCELLED);
    });

    it('does not call getBookingSettings for a PENDING booking', async () => {
      const getSpy = jest.spyOn(settingsPort, 'getBookingSettings');
      const booking = new BookingBuilder()
        .withTenantId(TENANT_A)
        .withCustomerId(CUSTOMER_ID)
        .build();
      await bookingRepo.save(booking);

      await useCase.execute({ bookingId: booking.id });

      expect(getSpy).not.toHaveBeenCalled();
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

      const result = await useCase.execute({ bookingId: booking.id });

      expect(result.status).toBe(BookingStatus.CANCELLED);
    });
  });

  describe('error cases', () => {
    it('throws BookingNotFoundError when booking does not exist', async () => {
      await expect(
        useCase.execute({ bookingId: '00000000-0000-4000-8000-000000000000' }),
      ).rejects.toThrow(BookingNotFoundError);
    });

    it('throws BookingForbiddenError when caller is not the booking owner', async () => {
      const booking = new BookingBuilder()
        .withTenantId(TENANT_A)
        .withCustomerId(OTHER_CUSTOMER_ID)
        .build();
      await bookingRepo.save(booking);

      await expect(useCase.execute({ bookingId: booking.id })).rejects.toThrow(
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

      await expect(useCase.execute({ bookingId: booking.id })).rejects.toThrow(
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

      await expect(useCase.execute({ bookingId: booking.id })).rejects.toThrow(
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

      await expect(useCase.execute({ bookingId: booking.id })).rejects.toThrow(
        InvalidBookingTransitionError,
      );
    });

    it('tenant isolation: cannot cancel booking from another tenant', async () => {
      const booking = new BookingBuilder()
        .withTenantId(TENANT_B)
        .withCustomerId(CUSTOMER_ID)
        .build();
      await bookingRepo.save(booking);

      await expect(useCase.execute({ bookingId: booking.id })).rejects.toThrow(
        BookingNotFoundError,
      );
    });
  });
});
