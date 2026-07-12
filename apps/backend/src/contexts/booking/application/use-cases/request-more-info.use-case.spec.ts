import { InMemoryEventBus } from '../../../../test/infrastructure/in-memory-event-bus';
import { InMemoryTransactionManager } from '../../../../test/infrastructure/in-memory-transaction-manager';
import { InMemoryBookingRepository } from '../../../../test/repositories/booking/in-memory-booking.repository';
import { BookingBuilder } from '../../../../test/builders/booking/index';
import { futureDate } from '../../../../test/utils/date-helpers';
import { BookingStatus } from '../../domain/booking.aggregate';
import {
  BookingInfoMessageTooShortError,
  BookingNotFoundError,
  InvalidBookingTransitionError,
} from '../../domain/errors/booking-domain.error';
import { RequestMoreInfoUseCase } from './request-more-info.use-case';

const TENANT_A = '10000000-0000-4000-8000-000000000401';
const TENANT_B = '10000000-0000-4000-8000-000000000402';
const STAFF_ID = '20000000-0000-4000-8000-000000000401';
const CORRELATION_ID = 'corr-request-info-test';
const VALID_MESSAGE = 'Please provide clearer photos of the vehicle';

const scheduledAt = new Date(`${futureDate(2)}T13:00:00.000Z`);

describe('RequestMoreInfoUseCase', () => {
  let bookingRepo: InMemoryBookingRepository;
  let eventBus: InMemoryEventBus;
  let useCase: RequestMoreInfoUseCase;

  beforeEach(() => {
    eventBus = new InMemoryEventBus();
    bookingRepo = new InMemoryBookingRepository(eventBus);
    useCase = new RequestMoreInfoUseCase(bookingRepo, new InMemoryTransactionManager());
  });

  it('transitions PENDING → INFO_REQUESTED and returns result with infoRequestedAt', async () => {
    const booking = new BookingBuilder()
      .withTenantId(TENANT_A)
      .withScheduledAt(scheduledAt)
      .build();
    await bookingRepo.save(booking);

    const result = await useCase.execute({
      bookingId: booking.id,
      message: VALID_MESSAGE,
      tenantId: TENANT_A,
      staffId: STAFF_ID,
      correlationId: CORRELATION_ID,
    });

    expect(result.status).toBe(BookingStatus.INFO_REQUESTED);
    expect(result.bookingId).toBe(booking.id);
    expect(result.infoRequestedAt).toBeDefined();
  });

  it('persists infoRequestMessage, infoRequestedAt, and infoRequestedBy', async () => {
    const booking = new BookingBuilder()
      .withTenantId(TENANT_A)
      .withScheduledAt(scheduledAt)
      .build();
    await bookingRepo.save(booking);

    await useCase.execute({
      bookingId: booking.id,
      message: VALID_MESSAGE,
      tenantId: TENANT_A,
      staffId: STAFF_ID,
      correlationId: CORRELATION_ID,
    });

    const saved = await bookingRepo.findById(booking.id, TENANT_A);
    expect(saved!.infoRequestMessage).toBe(VALID_MESSAGE);
    expect(saved!.infoRequestedAt).not.toBeNull();
    expect(saved!.infoRequestedBy).toBe(STAFF_ID);
  });

  it('publishes BookingInfoRequested event with informationNeeded and requestedBy', async () => {
    const booking = new BookingBuilder()
      .withTenantId(TENANT_A)
      .withScheduledAt(scheduledAt)
      .build();
    await bookingRepo.save(booking);

    await useCase.execute({
      bookingId: booking.id,
      message: VALID_MESSAGE,
      tenantId: TENANT_A,
      staffId: STAFF_ID,
      correlationId: CORRELATION_ID,
    });

    expect(eventBus.published).toHaveLength(1);
    expect(eventBus.published[0].eventName).toBe('BookingInfoRequested');
    const data = eventBus.published[0].data as {
      informationNeeded: string;
      requestedBy: string;
    };
    expect(data.informationNeeded).toBe(VALID_MESSAGE);
    expect(data.requestedBy).toBe(STAFF_ID);
  });

  it('stores trimmed message', async () => {
    const booking = new BookingBuilder()
      .withTenantId(TENANT_A)
      .withScheduledAt(scheduledAt)
      .build();
    await bookingRepo.save(booking);

    await useCase.execute({
      bookingId: booking.id,
      message: `  ${VALID_MESSAGE}  `,
      tenantId: TENANT_A,
      staffId: STAFF_ID,
      correlationId: CORRELATION_ID,
    });

    const saved = await bookingRepo.findById(booking.id, TENANT_A);
    expect(saved!.infoRequestMessage).toBe(VALID_MESSAGE);
  });

  it('throws BookingInfoMessageTooShortError when message is shorter than 20 chars', async () => {
    const booking = new BookingBuilder()
      .withTenantId(TENANT_A)
      .withScheduledAt(scheduledAt)
      .build();
    await bookingRepo.save(booking);

    await expect(
      useCase.execute({
        bookingId: booking.id,
        message: 'Too short',
        tenantId: TENANT_A,
        staffId: STAFF_ID,
        correlationId: CORRELATION_ID,
      }),
    ).rejects.toThrow(BookingInfoMessageTooShortError);
  });

  it('throws BookingInfoMessageTooShortError when message is empty', async () => {
    const booking = new BookingBuilder()
      .withTenantId(TENANT_A)
      .withScheduledAt(scheduledAt)
      .build();
    await bookingRepo.save(booking);

    await expect(
      useCase.execute({
        bookingId: booking.id,
        message: '',
        tenantId: TENANT_A,
        staffId: STAFF_ID,
        correlationId: CORRELATION_ID,
      }),
    ).rejects.toThrow(BookingInfoMessageTooShortError);
  });

  it('throws BookingInfoMessageTooShortError even when booking is not PENDING (length checked first)', async () => {
    const booking = new BookingBuilder()
      .withTenantId(TENANT_A)
      .withScheduledAt(scheduledAt)
      .withStatus(BookingStatus.INFO_REQUESTED)
      .build();
    await bookingRepo.save(booking);

    await expect(
      useCase.execute({
        bookingId: booking.id,
        message: 'short',
        tenantId: TENANT_A,
        staffId: STAFF_ID,
        correlationId: CORRELATION_ID,
      }),
    ).rejects.toThrow(BookingInfoMessageTooShortError);
  });

  it('throws BookingNotFoundError when booking does not exist', async () => {
    await expect(
      useCase.execute({
        bookingId: '00000000-0000-4000-8000-000000000000',
        message: VALID_MESSAGE,
        tenantId: TENANT_A,
        staffId: STAFF_ID,
        correlationId: CORRELATION_ID,
      }),
    ).rejects.toThrow(BookingNotFoundError);
  });

  it('throws InvalidBookingTransitionError when booking is already INFO_REQUESTED', async () => {
    const booking = new BookingBuilder()
      .withTenantId(TENANT_A)
      .withScheduledAt(scheduledAt)
      .withStatus(BookingStatus.INFO_REQUESTED)
      .build();
    await bookingRepo.save(booking);

    await expect(
      useCase.execute({
        bookingId: booking.id,
        message: VALID_MESSAGE,
        tenantId: TENANT_A,
        staffId: STAFF_ID,
        correlationId: CORRELATION_ID,
      }),
    ).rejects.toThrow(InvalidBookingTransitionError);
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
        message: VALID_MESSAGE,
        tenantId: TENANT_A,
        staffId: STAFF_ID,
        correlationId: CORRELATION_ID,
      }),
    ).rejects.toThrow(InvalidBookingTransitionError);
  });

  it('throws InvalidBookingTransitionError when booking is REJECTED', async () => {
    const booking = new BookingBuilder()
      .withTenantId(TENANT_A)
      .withScheduledAt(scheduledAt)
      .withStatus(BookingStatus.REJECTED)
      .build();
    await bookingRepo.save(booking);

    await expect(
      useCase.execute({
        bookingId: booking.id,
        message: VALID_MESSAGE,
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
        message: VALID_MESSAGE,
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
        message: VALID_MESSAGE,
        tenantId: TENANT_A,
        staffId: STAFF_ID,
        correlationId: CORRELATION_ID,
      }),
    ).rejects.toThrow(InvalidBookingTransitionError);
  });

  it('tenant isolation: cannot request info on a booking from another tenant', async () => {
    const booking = new BookingBuilder()
      .withTenantId(TENANT_B)
      .withScheduledAt(scheduledAt)
      .build();
    await bookingRepo.save(booking);

    await expect(
      useCase.execute({
        bookingId: booking.id,
        message: VALID_MESSAGE,
        tenantId: TENANT_A,
        staffId: STAFF_ID,
        correlationId: CORRELATION_ID,
      }),
    ).rejects.toThrow(BookingNotFoundError);
  });
});
