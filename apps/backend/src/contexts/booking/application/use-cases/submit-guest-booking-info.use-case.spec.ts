import { InMemoryBookingRepository } from '../../../../test/repositories/booking/in-memory-booking.repository';
import { InMemoryTransactionManager } from '../../../../test/infrastructure/in-memory-transaction-manager';
import { InMemoryEventBus } from '../../../../test/infrastructure/in-memory-event-bus';
import { InMemoryStorageService } from '../../../../test/infrastructure/in-memory-storage.service';
import { BookingBuilder } from '../../../../test/builders/booking/booking.builder';
import { BookingStatus } from '../../domain/booking.aggregate';
import {
  BookingForbiddenError,
  BookingNotFoundError,
  BookingPhotoNotUploadedError,
} from '../../domain/errors/booking-domain.error';
import { PhotoExistenceService } from '../services/photo-existence.service';
import { SubmitGuestBookingInfoUseCase } from './submit-guest-booking-info.use-case';

const TENANT_A = '10000000-0000-4000-8000-000000000021';
const TENANT_B = '10000000-0000-4000-8000-000000000022';
const CORRELATION_ID = 'corr-guest-info-test';

describe('SubmitGuestBookingInfoUseCase', () => {
  let repo: InMemoryBookingRepository;
  let txManager: InMemoryTransactionManager;
  let eventBus: InMemoryEventBus;
  let storageService: InMemoryStorageService;
  let useCase: SubmitGuestBookingInfoUseCase;
  let guestBookingId: string;

  beforeEach(async () => {
    repo = new InMemoryBookingRepository();
    txManager = new InMemoryTransactionManager();
    eventBus = new InMemoryEventBus();
    storageService = new InMemoryStorageService();

    const guestBooking = new BookingBuilder()
      .withTenantId(TENANT_A)
      .withCustomerId(null)
      .withStatus(BookingStatus.INFO_REQUESTED)
      .withLinesModified(false)
      .build();
    guestBookingId = guestBooking.id;
    await repo.save(guestBooking);

    useCase = new SubmitGuestBookingInfoUseCase(
      repo,
      txManager,
      eventBus,
      new PhotoExistenceService(storageService),
    );
  });

  it('transitions INFO_REQUESTED → PENDING for a guest booking', async () => {
    const result = await useCase.execute({
      bookingId: guestBookingId,
      contactEmail: 'joao@example.com',
      response: 'Segue a foto do carro',
      tenantId: TENANT_A,
      correlationId: CORRELATION_ID,
    });

    expect(result.status).toBe('PENDING');
    expect(result.bookingId).toBe(guestBookingId);
    expect(result.infoSubmittedAt).toBeDefined();
  });

  it('publishes BookingInfoSubmitted event with null customerId', async () => {
    await useCase.execute({
      bookingId: guestBookingId,
      contactEmail: 'joao@example.com',
      response: 'Aqui está a foto',
      tenantId: TENANT_A,
      correlationId: CORRELATION_ID,
    });

    const published = eventBus.published;
    expect(published).toHaveLength(1);
    expect(published[0].eventName).toBe('BookingInfoSubmitted');
    const data = published[0].data as Record<string, unknown>;
    expect(data['customerId']).toBeNull();
    expect(data['submittedByEmail']).toBe('joao@example.com');
  });

  it('throws BookingNotFoundError when booking does not exist', async () => {
    await expect(
      useCase.execute({
        bookingId: '00000000-0000-4000-8000-999999999999',
        contactEmail: 'x@example.com',
        response: 'ok',
        tenantId: TENANT_A,
        correlationId: CORRELATION_ID,
      }),
    ).rejects.toBeInstanceOf(BookingNotFoundError);
  });

  it('throws BookingForbiddenError when booking belongs to an authenticated customer', async () => {
    const customerBooking = new BookingBuilder()
      .withTenantId(TENANT_A)
      .withCustomerId('customerid-0000-4000-8000-000000000001')
      .withStatus(BookingStatus.INFO_REQUESTED)
      .withLinesModified(false)
      .build();
    await repo.save(customerBooking);

    await expect(
      useCase.execute({
        bookingId: customerBooking.id,
        contactEmail: 'x@example.com',
        response: 'ok',
        tenantId: TENANT_A,
        correlationId: CORRELATION_ID,
      }),
    ).rejects.toBeInstanceOf(BookingForbiddenError);
  });

  it('tenant isolation: returns BookingNotFoundError for booking in another tenant', async () => {
    await expect(
      useCase.execute({
        bookingId: guestBookingId,
        contactEmail: 'x@example.com',
        response: 'ok',
        tenantId: TENANT_B,
        correlationId: CORRELATION_ID,
      }),
    ).rejects.toBeInstanceOf(BookingNotFoundError);
  });

  it('throws BookingPhotoNotUploadedError when a photo path does not exist in storage', async () => {
    await expect(
      useCase.execute({
        bookingId: guestBookingId,
        contactEmail: 'joao@example.com',
        response: 'Segue a foto do carro',
        photoUrls: [`tenants/${TENANT_A}/uploads/upload-1/missing.jpg`],
        tenantId: TENANT_A,
        correlationId: CORRELATION_ID,
      }),
    ).rejects.toBeInstanceOf(BookingPhotoNotUploadedError);
  });
});
