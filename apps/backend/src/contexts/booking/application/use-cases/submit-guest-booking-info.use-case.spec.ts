import { InMemoryBookingRepository } from '../../../../test/repositories/booking/in-memory-booking.repository';
import { InMemoryTransactionManager } from '../../../../test/infrastructure/in-memory-transaction-manager';
import { InMemoryEventBus } from '../../../../test/infrastructure/in-memory-event-bus';
import { BookingBuilder } from '../../../../test/builders/booking/booking.builder';
import { TenantContextBuilder } from '../../../../test/factories/tenant-context.factory';
import { BookingStatus } from '../../domain/booking.aggregate';
import {
  BookingForbiddenError,
  BookingNotFoundError,
} from '../../domain/errors/booking-domain.error';
import { SubmitGuestBookingInfoUseCase } from './submit-guest-booking-info.use-case';

const TENANT_A = '10000000-0000-4000-8000-000000000021';

describe('SubmitGuestBookingInfoUseCase', () => {
  let repo: InMemoryBookingRepository;
  let txManager: InMemoryTransactionManager;
  let eventBus: InMemoryEventBus;
  let useCase: SubmitGuestBookingInfoUseCase;
  let guestBookingId: string;

  beforeEach(async () => {
    repo = new InMemoryBookingRepository();
    txManager = new InMemoryTransactionManager();
    eventBus = new InMemoryEventBus();

    const guestBooking = new BookingBuilder()
      .withTenantId(TENANT_A)
      .withCustomerId(null)
      .withStatus(BookingStatus.INFO_REQUESTED)
      .withLinesModified(false)
      .build();
    guestBookingId = guestBooking.id;
    await repo.save(guestBooking);

    const ctx = new TenantContextBuilder().withTenantId(TENANT_A).build();
    useCase = new SubmitGuestBookingInfoUseCase(ctx, repo, txManager, eventBus);
  });

  it('transitions INFO_REQUESTED → PENDING for a guest booking', async () => {
    const result = await useCase.execute({
      bookingId: guestBookingId,
      contactEmail: 'joao@example.com',
      response: 'Segue a foto do carro',
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
      }),
    ).rejects.toBeInstanceOf(BookingForbiddenError);
  });

  it('tenant isolation: returns BookingNotFoundError for booking in another tenant', async () => {
    const TENANT_B = '10000000-0000-4000-8000-000000000022';
    const ctx = new TenantContextBuilder().withTenantId(TENANT_B).build();
    const uc = new SubmitGuestBookingInfoUseCase(ctx, repo, txManager, eventBus);

    await expect(
      uc.execute({ bookingId: guestBookingId, contactEmail: 'x@example.com', response: 'ok' }),
    ).rejects.toBeInstanceOf(BookingNotFoundError);
  });
});
