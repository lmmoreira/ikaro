import { InMemoryEventBus } from '../../../../test/infrastructure/in-memory-event-bus';
import { InMemoryTransactionManager } from '../../../../test/infrastructure/in-memory-transaction-manager';
import { InMemoryBookingRepository } from '../../../../test/repositories/booking/in-memory-booking.repository';
import { BookingBuilder } from '../../../../test/builders/booking/index';
import { futureDate } from '../../../../test/utils/date-helpers';
import { BookingStatus } from '../../domain/booking.aggregate';
import {
  BookingNotFoundError,
  BookingRejectionReasonTooShortError,
  InvalidBookingTransitionError,
} from '../../domain/errors/booking-domain.error';
import { RejectBookingUseCase } from './reject-booking.use-case';

const TENANT_A = '10000000-0000-4000-8000-000000000301';
const TENANT_B = '10000000-0000-4000-8000-000000000302';
const STAFF_ID = '20000000-0000-4000-8000-000000000301';
const CORRELATION_ID = 'corr-reject-test';
const VALID_REASON = 'Service unavailable for that date';

const scheduledAt = new Date(`${futureDate(2)}T13:00:00.000Z`);

describe('RejectBookingUseCase', () => {
  let bookingRepo: InMemoryBookingRepository;
  let eventBus: InMemoryEventBus;
  let useCase: RejectBookingUseCase;

  beforeEach(() => {
    eventBus = new InMemoryEventBus();
    bookingRepo = new InMemoryBookingRepository(eventBus);
    useCase = new RejectBookingUseCase(bookingRepo, new InMemoryTransactionManager());
  });

  it('transitions PENDING → REJECTED and returns result with rejectedAt', async () => {
    const booking = new BookingBuilder()
      .withTenantId(TENANT_A)
      .withScheduledAt(scheduledAt)
      .build();
    await bookingRepo.save(booking);

    const result = await useCase.execute({
      bookingId: booking.id,
      reason: VALID_REASON,
      tenantId: TENANT_A,
      staffId: STAFF_ID,
      correlationId: CORRELATION_ID,
    });

    expect(result.status).toBe(BookingStatus.REJECTED);
    expect(result.bookingId).toBe(booking.id);
    expect(result.rejectedAt).toBeDefined();
  });

  it('transitions INFO_REQUESTED → REJECTED', async () => {
    const booking = new BookingBuilder()
      .withTenantId(TENANT_A)
      .withScheduledAt(scheduledAt)
      .withStatus(BookingStatus.INFO_REQUESTED)
      .build();
    await bookingRepo.save(booking);

    const result = await useCase.execute({
      bookingId: booking.id,
      reason: VALID_REASON,
      tenantId: TENANT_A,
      staffId: STAFF_ID,
      correlationId: CORRELATION_ID,
    });

    expect(result.status).toBe(BookingStatus.REJECTED);
  });

  it('persists rejectedBy, rejectedAt, and rejectionReason', async () => {
    const booking = new BookingBuilder()
      .withTenantId(TENANT_A)
      .withScheduledAt(scheduledAt)
      .build();
    await bookingRepo.save(booking);

    await useCase.execute({
      bookingId: booking.id,
      reason: VALID_REASON,
      tenantId: TENANT_A,
      staffId: STAFF_ID,
      correlationId: CORRELATION_ID,
    });

    const saved = await bookingRepo.findById(booking.id, TENANT_A);
    expect(saved!.rejectedBy).toBe(STAFF_ID);
    expect(saved!.rejectedAt).not.toBeNull();
    expect(saved!.rejectionReason).toBe(VALID_REASON);
  });

  it('publishes BookingRejected event with reason and rejectedBy', async () => {
    const booking = new BookingBuilder()
      .withTenantId(TENANT_A)
      .withScheduledAt(scheduledAt)
      .build();
    await bookingRepo.save(booking);

    await useCase.execute({
      bookingId: booking.id,
      reason: VALID_REASON,
      tenantId: TENANT_A,
      staffId: STAFF_ID,
      correlationId: CORRELATION_ID,
    });

    expect(eventBus.published).toHaveLength(1);
    expect(eventBus.published[0].eventName).toBe('BookingRejected');
    const data = eventBus.published[0].data as { reason: string; rejectedBy: string };
    expect(data.reason).toBe(VALID_REASON);
    expect(data.rejectedBy).toBe(STAFF_ID);
  });

  it('throws BookingRejectionReasonTooShortError when reason is too short', async () => {
    const booking = new BookingBuilder()
      .withTenantId(TENANT_A)
      .withScheduledAt(scheduledAt)
      .build();
    await bookingRepo.save(booking);

    await expect(
      useCase.execute({
        bookingId: booking.id,
        reason: 'short',
        tenantId: TENANT_A,
        staffId: STAFF_ID,
        correlationId: CORRELATION_ID,
      }),
    ).rejects.toThrow(BookingRejectionReasonTooShortError);
  });

  it('throws BookingRejectionReasonTooShortError when reason is empty', async () => {
    const booking = new BookingBuilder()
      .withTenantId(TENANT_A)
      .withScheduledAt(scheduledAt)
      .build();
    await bookingRepo.save(booking);

    await expect(
      useCase.execute({
        bookingId: booking.id,
        reason: '',
        tenantId: TENANT_A,
        staffId: STAFF_ID,
        correlationId: CORRELATION_ID,
      }),
    ).rejects.toThrow(BookingRejectionReasonTooShortError);
  });

  it('throws BookingNotFoundError when booking does not exist', async () => {
    await expect(
      useCase.execute({
        bookingId: '00000000-0000-4000-8000-000000000000',
        reason: VALID_REASON,
        tenantId: TENANT_A,
        staffId: STAFF_ID,
        correlationId: CORRELATION_ID,
      }),
    ).rejects.toThrow(BookingNotFoundError);
  });

  it('throws InvalidBookingTransitionError when booking is APPROVED', async () => {
    const booking = new BookingBuilder()
      .withTenantId(TENANT_A)
      .withScheduledAt(scheduledAt)
      .withStatus(BookingStatus.APPROVED)
      .build();
    await bookingRepo.save(booking);

    await expect(
      useCase.execute({
        bookingId: booking.id,
        reason: VALID_REASON,
        tenantId: TENANT_A,
        staffId: STAFF_ID,
        correlationId: CORRELATION_ID,
      }),
    ).rejects.toThrow(InvalidBookingTransitionError);
  });

  it('throws InvalidBookingTransitionError when booking is COMPLETED', async () => {
    const booking = new BookingBuilder()
      .withTenantId(TENANT_A)
      .withScheduledAt(scheduledAt)
      .withStatus(BookingStatus.COMPLETED)
      .build();
    await bookingRepo.save(booking);

    await expect(
      useCase.execute({
        bookingId: booking.id,
        reason: VALID_REASON,
        tenantId: TENANT_A,
        staffId: STAFF_ID,
        correlationId: CORRELATION_ID,
      }),
    ).rejects.toThrow(InvalidBookingTransitionError);
  });

  it('throws InvalidBookingTransitionError when booking is already REJECTED', async () => {
    const booking = new BookingBuilder()
      .withTenantId(TENANT_A)
      .withScheduledAt(scheduledAt)
      .withStatus(BookingStatus.REJECTED)
      .build();
    await bookingRepo.save(booking);

    await expect(
      useCase.execute({
        bookingId: booking.id,
        reason: VALID_REASON,
        tenantId: TENANT_A,
        staffId: STAFF_ID,
        correlationId: CORRELATION_ID,
      }),
    ).rejects.toThrow(InvalidBookingTransitionError);
  });

  it('throws InvalidBookingTransitionError when booking is CANCELLED', async () => {
    const booking = new BookingBuilder()
      .withTenantId(TENANT_A)
      .withScheduledAt(scheduledAt)
      .withStatus(BookingStatus.CANCELLED)
      .build();
    await bookingRepo.save(booking);

    await expect(
      useCase.execute({
        bookingId: booking.id,
        reason: VALID_REASON,
        tenantId: TENANT_A,
        staffId: STAFF_ID,
        correlationId: CORRELATION_ID,
      }),
    ).rejects.toThrow(InvalidBookingTransitionError);
  });

  it('tenant isolation: cannot reject a booking from another tenant', async () => {
    const booking = new BookingBuilder()
      .withTenantId(TENANT_B)
      .withScheduledAt(scheduledAt)
      .build();
    await bookingRepo.save(booking);

    await expect(
      useCase.execute({
        bookingId: booking.id,
        reason: VALID_REASON,
        tenantId: TENANT_A,
        staffId: STAFF_ID,
        correlationId: CORRELATION_ID,
      }),
    ).rejects.toThrow(BookingNotFoundError);
  });
});
