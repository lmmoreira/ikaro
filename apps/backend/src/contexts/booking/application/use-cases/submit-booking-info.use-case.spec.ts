import { InMemoryEventBus } from '../../../../test/infrastructure/in-memory-event-bus';
import { InMemoryTransactionManager } from '../../../../test/infrastructure/in-memory-transaction-manager';
import { InMemoryResourceOccupancyRepository } from '../../../../test/repositories/booking/in-memory-resource-occupancy.repository';
import { InMemoryServiceRepository } from '../../../../test/repositories/booking/in-memory-service.repository';
import { InMemoryStorageService } from '../../../../test/infrastructure/in-memory-storage.service';
import { InMemoryBookingRepository } from '../../../../test/repositories/booking/in-memory-booking.repository';
import { InMemoryBookingStatusTransitionRepository } from '../../../../test/repositories/booking/in-memory-booking-status-transition.repository';
import { BookingBuilder } from '../../../../test/builders/booking/index';
import { seedOccupancy } from '../../../../test/utils/occupancy-seed';
import { futureDate } from '../../../../test/utils/date-helpers';
import { BookingStatus } from '../../domain/booking.aggregate';
import {
  BookingForbiddenError,
  BookingNotFoundError,
  BookingPhotoNotUploadedError,
  InvalidBookingTransitionError,
} from '../../domain/errors/booking-domain.error';
import { PhotoExistenceService } from '../services/photo-existence.service';
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
  let transitionRepo: InMemoryBookingStatusTransitionRepository;
  let eventBus: InMemoryEventBus;
  let storageService: InMemoryStorageService;
  let occupancyRepo: InMemoryResourceOccupancyRepository;
  let useCase: SubmitBookingInfoUseCase;

  beforeEach(() => {
    eventBus = new InMemoryEventBus();
    transitionRepo = new InMemoryBookingStatusTransitionRepository();
    bookingRepo = new InMemoryBookingRepository(eventBus, transitionRepo);
    storageService = new InMemoryStorageService();
    occupancyRepo = new InMemoryResourceOccupancyRepository();
    useCase = new SubmitBookingInfoUseCase(
      bookingRepo,
      new InMemoryTransactionManager(),
      new PhotoExistenceService(storageService),
      new InMemoryServiceRepository(),
      occupancyRepo,
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

    const result = await useCase.execute({
      bookingId: booking.id,
      response: VALID_RESPONSE,
      tenantId: TENANT_A,
      customerId: CUSTOMER_ID,
      correlationId: CORRELATION_ID,
    });

    expect(result.status).toBe(BookingStatus.PENDING);
    expect(result.bookingId).toBe(booking.id);
    expect(result.infoSubmittedAt).toBeDefined();
  });

  describe('hold restart (TD51)', () => {
    async function infoRequestedBookingWithHold(holdExpiresAt: Date) {
      const booking = new BookingBuilder()
        .withTenantId(TENANT_A)
        .withCustomerId(CUSTOMER_ID)
        .withStatus(BookingStatus.INFO_REQUESTED)
        .withScheduledAt(scheduledAt)
        .build();
      await bookingRepo.save(booking);
      await seedOccupancy(occupancyRepo, {
        tenantId: TENANT_A,
        bookingLineId: booking.lines[0].lineId,
        lockState: 'HOLD',
        holdExpiresAt,
      });
      return booking;
    }

    const answer = (bookingId: string) =>
      useCase.execute({
        bookingId,
        response: VALID_RESPONSE,
        tenantId: TENANT_A,
        customerId: CUSTOMER_ID,
        correlationId: CORRELATION_ID,
      });

    it('restarts a hold that already passed, so staff get a fresh window and the job does not expire the answered booking', async () => {
      const booking = await infoRequestedBookingWithHold(new Date(Date.now() - 3_600_000));

      await answer(booking.id);

      const [row] = await occupancyRepo.findOccupancyByBookingLines(
        TENANT_A,
        booking.lines.map((line) => line.lineId),
      );
      expect(row.lockState).toBe('HOLD');
      expect(row.holdExpiresAt!.getTime()).toBeGreaterThan(Date.now() + 25 * 60_000);
    });

    it("does not touch another tenant's rows for the same line id", async () => {
      const booking = await infoRequestedBookingWithHold(new Date(Date.now() - 3_600_000));
      const otherTenantDeadline = new Date(Date.now() - 7_200_000);
      await seedOccupancy(occupancyRepo, {
        tenantId: TENANT_B,
        bookingLineId: booking.lines[0].lineId,
        lockState: 'HOLD',
        holdExpiresAt: otherTenantDeadline,
        resourceId: 'eeeeeeee-0000-4000-8000-000000000002',
      });

      await answer(booking.id);

      const [row] = await occupancyRepo.findOccupancyByBookingLines(
        TENANT_B,
        booking.lines.map((line) => line.lineId),
      );
      expect(row.holdExpiresAt).toEqual(otherTenantDeadline);
    });
  });

  it('records the reply as one audit row for the customer, without the free-text reply', async () => {
    const booking = new BookingBuilder()
      .withTenantId(TENANT_A)
      .withCustomerId(CUSTOMER_ID)
      .withStatus(BookingStatus.INFO_REQUESTED)
      .withScheduledAt(scheduledAt)
      .build();
    await bookingRepo.save(booking);

    await useCase.execute({
      bookingId: booking.id,
      response: VALID_RESPONSE,
      tenantId: TENANT_A,
      customerId: CUSTOMER_ID,
      correlationId: CORRELATION_ID,
    });

    expect(transitionRepo.all()).toMatchObject([
      {
        bookingId: booking.id,
        fromStatus: 'INFO_REQUESTED',
        toStatus: 'PENDING',
        actorType: 'CUSTOMER',
        actorId: CUSTOMER_ID,
        reason: null,
      },
    ]);
  });

  it('persists infoResponseMessage and infoSubmittedAt', async () => {
    const booking = new BookingBuilder()
      .withTenantId(TENANT_A)
      .withCustomerId(CUSTOMER_ID)
      .withStatus(BookingStatus.INFO_REQUESTED)
      .withScheduledAt(scheduledAt)
      .build();
    await bookingRepo.save(booking);

    await useCase.execute({
      bookingId: booking.id,
      response: VALID_RESPONSE,
      tenantId: TENANT_A,
      customerId: CUSTOMER_ID,
      correlationId: CORRELATION_ID,
    });

    const saved = await bookingRepo.findById(booking.id, TENANT_A);
    expect(saved!.infoResponseMessage).toBe(VALID_RESPONSE);
    expect(saved!.infoSubmittedAt).not.toBeNull();
  });

  it('promotes photoUrls from tmp/ to the permanent booking path and appends to beforeServicePhotoUrls', async () => {
    const tmpPaths = [`tmp/${TENANT_A}/upload-1/photo1.jpg`, `tmp/${TENANT_A}/upload-2/photo2.jpg`];
    tmpPaths.forEach((path) => storageService.markAsUploaded(path));
    const booking = new BookingBuilder()
      .withTenantId(TENANT_A)
      .withCustomerId(CUSTOMER_ID)
      .withStatus(BookingStatus.INFO_REQUESTED)
      .withScheduledAt(scheduledAt)
      .build();
    await bookingRepo.save(booking);

    await useCase.execute({
      bookingId: booking.id,
      response: VALID_RESPONSE,
      photoUrls: tmpPaths,
      tenantId: TENANT_A,
      customerId: CUSTOMER_ID,
      correlationId: CORRELATION_ID,
    });

    const saved = await bookingRepo.findById(booking.id, TENANT_A);
    expect(saved!.beforeServicePhotoUrls).toEqual(
      expect.arrayContaining([
        `tenants/${TENANT_A}/bookings/${booking.id}/upload-1/photo1.jpg`,
        `tenants/${TENANT_A}/bookings/${booking.id}/upload-2/photo2.jpg`,
      ]),
    );
    expect(storageService.deletedPaths).toEqual(expect.arrayContaining(tmpPaths));
  });

  it('throws BookingPhotoNotUploadedError when a photo path does not exist in storage', async () => {
    const booking = new BookingBuilder()
      .withTenantId(TENANT_A)
      .withCustomerId(CUSTOMER_ID)
      .withStatus(BookingStatus.INFO_REQUESTED)
      .withScheduledAt(scheduledAt)
      .build();
    await bookingRepo.save(booking);

    await expect(
      useCase.execute({
        bookingId: booking.id,
        response: VALID_RESPONSE,
        photoUrls: [`tmp/${TENANT_A}/upload-1/missing.jpg`],
        tenantId: TENANT_A,
        customerId: CUSTOMER_ID,
        correlationId: CORRELATION_ID,
      }),
    ).rejects.toBeInstanceOf(BookingPhotoNotUploadedError);
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

    await useCase.execute({
      bookingId: booking.id,
      response: VALID_RESPONSE,
      tenantId: TENANT_A,
      customerId: CUSTOMER_ID,
      correlationId: CORRELATION_ID,
    });

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
      useCase.execute({
        bookingId: booking.id,
        response: VALID_RESPONSE,
        tenantId: TENANT_A,
        customerId: CUSTOMER_ID,
        correlationId: CORRELATION_ID,
      }),
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
      useCase.execute({
        bookingId: booking.id,
        response: VALID_RESPONSE,
        tenantId: TENANT_A,
        customerId: CUSTOMER_ID,
        correlationId: CORRELATION_ID,
      }),
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
      useCase.execute({
        bookingId: booking.id,
        response: VALID_RESPONSE,
        tenantId: TENANT_A,
        customerId: CUSTOMER_ID,
        correlationId: CORRELATION_ID,
      }),
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
      useCase.execute({
        bookingId: booking.id,
        response: VALID_RESPONSE,
        tenantId: TENANT_A,
        customerId: CUSTOMER_ID,
        correlationId: CORRELATION_ID,
      }),
    ).rejects.toThrow(InvalidBookingTransitionError);
  });

  it('throws BookingNotFoundError when booking does not exist', async () => {
    await expect(
      useCase.execute({
        bookingId: '00000000-0000-4000-8000-000000000000',
        response: VALID_RESPONSE,
        tenantId: TENANT_A,
        customerId: CUSTOMER_ID,
        correlationId: CORRELATION_ID,
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
      useCase.execute({
        bookingId: booking.id,
        response: VALID_RESPONSE,
        tenantId: TENANT_A,
        customerId: CUSTOMER_ID,
        correlationId: CORRELATION_ID,
      }),
    ).rejects.toThrow(BookingNotFoundError);
  });
});
