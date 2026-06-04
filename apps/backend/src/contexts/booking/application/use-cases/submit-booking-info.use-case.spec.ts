import { InMemoryEventBus } from '../../../../test/infrastructure/in-memory-event-bus';
import { InMemoryTransactionManager } from '../../../../test/infrastructure/in-memory-transaction-manager';
import { InMemoryBookingRepository } from '../../../../test/repositories/booking/in-memory-booking.repository';
import { BookingBuilder } from '../../../../test/builders/booking/index';
import { TenantContextBuilder } from '../../../../test/factories/tenant-context.factory';
import { futureDate } from '../../../../test/utils/date-helpers';
import { BookingStatus } from '../../domain/booking.aggregate';
import {
  BookingForbiddenError,
  BookingNotFoundError,
  InvalidBookingTransitionError,
} from '../../domain/errors/booking-domain.error';
import { SubmitBookingInfoUseCase } from './submit-booking-info.use-case';

const TENANT_A = '10000000-0000-4000-8000-000000000501';
const TENANT_B = '10000000-0000-4000-8000-000000000502';
const CUSTOMER_ID = '20000000-0000-4000-8000-000000000501';
const OTHER_CUSTOMER_ID = '20000000-0000-4000-8000-000000000502';
const CORRELATION_ID = 'corr-submit-info-test';
const VALID_RESPONSE = 'Here are the photos you requested';

const scheduledAt = new Date(`${futureDate(2)}T13:00:00.000Z`);

describe('SubmitBookingInfoUseCase', () => {
  let bookingRepo: InMemoryBookingRepository;
  let eventBus: InMemoryEventBus;
  let useCase: SubmitBookingInfoUseCase;

  beforeEach(() => {
    bookingRepo = new InMemoryBookingRepository();
    eventBus = new InMemoryEventBus();
    const ctx = new TenantContextBuilder()
      .withTenantId(TENANT_A)
      .withCorrelationId(CORRELATION_ID)
      .withActorId(CUSTOMER_ID)
      .withActorType('CUSTOMER')
      .withActorRole('CUSTOMER')
      .build();
    useCase = new SubmitBookingInfoUseCase(
      ctx,
      bookingRepo,
      new InMemoryTransactionManager(),
      eventBus,
    );
  });

  it('transitions INFO_REQUESTED → PENDING and returns result with infoSubmittedAt', async () => {
    const booking = new BookingBuilder()
      .withTenantId(TENANT_A)
      .withCustomerId(CUSTOMER_ID)
      .withStatus(BookingStatus.INFO_REQUESTED)
      .withScheduledAt(scheduledAt)
      .build();
    await bookingRepo.save(booking);

    const result = await useCase.execute({ bookingId: booking.id, response: VALID_RESPONSE });

    expect(result.status).toBe(BookingStatus.PENDING);
    expect(result.bookingId).toBe(booking.id);
    expect(result.infoSubmittedAt).toBeDefined();
  });

  it('persists infoResponseMessage and infoSubmittedAt', async () => {
    const booking = new BookingBuilder()
      .withTenantId(TENANT_A)
      .withCustomerId(CUSTOMER_ID)
      .withStatus(BookingStatus.INFO_REQUESTED)
      .withScheduledAt(scheduledAt)
      .build();
    await bookingRepo.save(booking);

    await useCase.execute({ bookingId: booking.id, response: VALID_RESPONSE });

    const saved = await bookingRepo.findById(booking.id, TENANT_A);
    expect(saved!.infoResponseMessage).toBe(VALID_RESPONSE);
    expect(saved!.infoSubmittedAt).not.toBeNull();
  });

  it('appends photoUrls to beforeServicePhotoUrls', async () => {
    const photoUrls = ['https://s3.example.com/photo1.jpg', 'https://s3.example.com/photo2.jpg'];
    const booking = new BookingBuilder()
      .withTenantId(TENANT_A)
      .withCustomerId(CUSTOMER_ID)
      .withStatus(BookingStatus.INFO_REQUESTED)
      .withScheduledAt(scheduledAt)
      .build();
    await bookingRepo.save(booking);

    await useCase.execute({ bookingId: booking.id, response: VALID_RESPONSE, photoUrls });

    const saved = await bookingRepo.findById(booking.id, TENANT_A);
    expect(saved!.beforeServicePhotoUrls).toEqual(expect.arrayContaining(photoUrls));
  });

  it('publishes BookingInfoSubmitted event with correct customerId and submittedByEmail', async () => {
    const booking = new BookingBuilder()
      .withTenantId(TENANT_A)
      .withCustomerId(CUSTOMER_ID)
      .withContactEmail('customer@example.com')
      .withStatus(BookingStatus.INFO_REQUESTED)
      .withScheduledAt(scheduledAt)
      .build();
    await bookingRepo.save(booking);

    await useCase.execute({ bookingId: booking.id, response: VALID_RESPONSE });

    expect(eventBus.published).toHaveLength(1);
    expect(eventBus.published[0].eventName).toBe('BookingInfoSubmitted');
    const data = eventBus.published[0].data as {
      customerId: string;
      submittedByEmail: string;
      infoPayload: Record<string, unknown>;
    };
    expect(data.customerId).toBe(CUSTOMER_ID);
    expect(data.submittedByEmail).toBe('customer@example.com');
    expect(data.infoPayload).toEqual({ notes: VALID_RESPONSE });
  });

  it('throws BookingForbiddenError when customerId does not match the caller', async () => {
    const booking = new BookingBuilder()
      .withTenantId(TENANT_A)
      .withCustomerId(OTHER_CUSTOMER_ID)
      .withStatus(BookingStatus.INFO_REQUESTED)
      .withScheduledAt(scheduledAt)
      .build();
    await bookingRepo.save(booking);

    await expect(
      useCase.execute({ bookingId: booking.id, response: VALID_RESPONSE }),
    ).rejects.toThrow(BookingForbiddenError);
  });

  it('throws BookingForbiddenError when the booking is a guest booking (no customerId)', async () => {
    const booking = new BookingBuilder()
      .withTenantId(TENANT_A)
      .withCustomerId(null)
      .withStatus(BookingStatus.INFO_REQUESTED)
      .withScheduledAt(scheduledAt)
      .build();
    await bookingRepo.save(booking);

    await expect(
      useCase.execute({ bookingId: booking.id, response: VALID_RESPONSE }),
    ).rejects.toThrow(BookingForbiddenError);
  });

  it('throws InvalidBookingTransitionError when booking is PENDING (not INFO_REQUESTED)', async () => {
    const booking = new BookingBuilder()
      .withTenantId(TENANT_A)
      .withCustomerId(CUSTOMER_ID)
      .withScheduledAt(scheduledAt)
      .build();
    await bookingRepo.save(booking);

    await expect(
      useCase.execute({ bookingId: booking.id, response: VALID_RESPONSE }),
    ).rejects.toThrow(InvalidBookingTransitionError);
  });

  it('throws InvalidBookingTransitionError when booking is APPROVED', async () => {
    const booking = new BookingBuilder()
      .withTenantId(TENANT_A)
      .withCustomerId(CUSTOMER_ID)
      .withStatus(BookingStatus.APPROVED)
      .withScheduledAt(scheduledAt)
      .build();
    await bookingRepo.save(booking);

    await expect(
      useCase.execute({ bookingId: booking.id, response: VALID_RESPONSE }),
    ).rejects.toThrow(InvalidBookingTransitionError);
  });

  it('throws BookingNotFoundError when booking does not exist', async () => {
    await expect(
      useCase.execute({
        bookingId: '00000000-0000-4000-8000-000000000000',
        response: VALID_RESPONSE,
      }),
    ).rejects.toThrow(BookingNotFoundError);
  });

  it('tenant isolation: cannot submit info for a booking from another tenant', async () => {
    const booking = new BookingBuilder()
      .withTenantId(TENANT_B)
      .withCustomerId(CUSTOMER_ID)
      .withStatus(BookingStatus.INFO_REQUESTED)
      .withScheduledAt(scheduledAt)
      .build();
    await bookingRepo.save(booking);

    await expect(
      useCase.execute({ bookingId: booking.id, response: VALID_RESPONSE }),
    ).rejects.toThrow(BookingNotFoundError);
  });
});
