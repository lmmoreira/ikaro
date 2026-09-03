import { HttpException, HttpStatus } from '@nestjs/common';
import { InMemoryTransactionManager } from '../../../../test/infrastructure/in-memory-transaction-manager';
import { InMemoryBookingAvailabilityPort } from '../../../../test/infrastructure/in-memory-booking-availability';
import { InMemoryTenantDayLock } from '../../../../test/infrastructure/in-memory-tenant-day-lock';
import { InMemoryStorageService } from '../../../../test/infrastructure/in-memory-storage.service';
import { InMemoryBookingRepository } from '../../../../test/repositories/booking/in-memory-booking.repository';
import { BookingBuilder } from '../../../../test/builders/booking/index';
import { RequestContextBuilder } from '../../../../test/factories/request-context.factory';
import { futureDate } from '../../../../test/utils/date-helpers';
import { BookingLifecycleController } from './booking-lifecycle.controller';
import { ApproveBookingUseCase } from '../../application/use-cases/approve-booking.use-case';
import { RejectBookingUseCase } from '../../application/use-cases/reject-booking.use-case';
import { RequestMoreInfoUseCase } from '../../application/use-cases/request-more-info.use-case';
import { SubmitBookingInfoUseCase } from '../../application/use-cases/submit-booking-info.use-case';
import { SubmitGuestBookingInfoUseCase } from '../../application/use-cases/submit-guest-booking-info.use-case';
import { BookingSlotConflictService } from '../../application/services/booking-slot-conflict.service';
import { PhotoExistenceService } from '../../application/services/photo-existence.service';
import { BookingStatus } from '../../domain/booking.aggregate';

const TENANT_A = '10000000-0000-4000-8000-000000000110';
const TENANT_B = '10000000-0000-4000-8000-000000000111';
const CUSTOMER_ID = '20000000-0000-4000-8000-000000000110';
const STAFF_ID = '20000000-0000-4000-8000-000000000112';
const CORRELATION_ID = 'corr-booking-ctrl-test';

describe('BookingLifecycleController', () => {
  let controller: BookingLifecycleController;
  let customerController: BookingLifecycleController;
  let bookingRepo: InMemoryBookingRepository;
  let storageService: InMemoryStorageService;

  beforeEach(() => {
    bookingRepo = new InMemoryBookingRepository();
    storageService = new InMemoryStorageService();
    const staffCtx = new RequestContextBuilder()
      .withTenantId(TENANT_A)
      .withCorrelationId(CORRELATION_ID)
      .withActorId(STAFF_ID)
      .withActorRole('MANAGER')
      .build();
    const customerCtx = new RequestContextBuilder()
      .withTenantId(TENANT_A)
      .withCorrelationId(CORRELATION_ID)
      .withActorId(CUSTOMER_ID)
      .withActorType('CUSTOMER')
      .withActorRole('CUSTOMER')
      .build();

    const makeUseCases = (repo: InMemoryBookingRepository) => ({
      approveBooking: new ApproveBookingUseCase(
        repo,
        new BookingSlotConflictService(
          new InMemoryBookingAvailabilityPort(),
          new InMemoryTenantDayLock(),
        ),
        new InMemoryTransactionManager(),
      ),
      rejectBooking: new RejectBookingUseCase(repo, new InMemoryTransactionManager()),
      requestMoreInfo: new RequestMoreInfoUseCase(repo, new InMemoryTransactionManager()),
      submitBookingInfo: new SubmitBookingInfoUseCase(
        repo,
        new InMemoryTransactionManager(),
        new PhotoExistenceService(storageService),
      ),
      submitGuestBookingInfo: new SubmitGuestBookingInfoUseCase(
        repo,
        new InMemoryTransactionManager(),
        new PhotoExistenceService(storageService),
      ),
    });

    const uc = makeUseCases(bookingRepo);
    controller = new BookingLifecycleController(
      staffCtx,
      uc.approveBooking,
      uc.rejectBooking,
      uc.requestMoreInfo,
      uc.submitBookingInfo,
      uc.submitGuestBookingInfo,
    );
    const ucC = makeUseCases(bookingRepo);
    customerController = new BookingLifecycleController(
      customerCtx,
      ucC.approveBooking,
      ucC.rejectBooking,
      ucC.requestMoreInfo,
      ucC.submitBookingInfo,
      ucC.submitGuestBookingInfo,
    );
  });

  describe('approve()', () => {
    it('approves a PENDING booking and returns 200 shape', async () => {
      const booking = new BookingBuilder()
        .withTenantId(TENANT_A)
        .withScheduledAt(new Date(`${futureDate(2)}T10:00:00.000Z`))
        .build();
      await bookingRepo.save(booking);

      const result = await controller.approve(booking.id, {});
      expect(result.status).toBe(BookingStatus.APPROVED);
      expect(result.bookingId).toBe(booking.id);
      expect(result.approvedAt).toBeDefined();
    });

    it('approves a booking with a retry scheduledAt override', async () => {
      const booking = new BookingBuilder()
        .withTenantId(TENANT_A)
        .withScheduledAt(new Date(`${futureDate(2)}T10:00:00.000Z`))
        .build();
      await bookingRepo.save(booking);

      const retryScheduledAt = new Date(`${futureDate(2)}T11:00:00.000Z`).toISOString();
      const result = await controller.approve(booking.id, { scheduledAt: retryScheduledAt });

      expect(result.status).toBe(BookingStatus.APPROVED);
      const saved = await bookingRepo.findById(booking.id, TENANT_A);
      expect(saved!.scheduledAt.toISOString()).toBe(retryScheduledAt);
    });

    it('maps BookingNotFoundError to 404', async () => {
      const err = await controller
        .approve('00000000-0000-4000-8000-000000009999', {})
        .catch((e: unknown) => e);
      expect(err).toBeInstanceOf(HttpException);
      expect((err as HttpException).getStatus()).toBe(HttpStatus.NOT_FOUND);
    });

    it('maps InvalidBookingTransitionError to 422', async () => {
      const booking = new BookingBuilder()
        .withTenantId(TENANT_A)
        .withStatus(BookingStatus.REJECTED)
        .withScheduledAt(new Date(`${futureDate(2)}T10:00:00.000Z`))
        .build();
      await bookingRepo.save(booking);

      const err = await controller.approve(booking.id, {}).catch((e: unknown) => e);
      expect(err).toBeInstanceOf(HttpException);
      expect((err as HttpException).getStatus()).toBe(HttpStatus.UNPROCESSABLE_ENTITY);
    });

    it('maps BookingSlotUnavailableError to 409 when slot is taken', async () => {
      const scheduledAt = new Date(`${futureDate(3)}T11:00:00.000Z`);
      const conflictPort = new InMemoryBookingAvailabilityPort();
      conflictPort.setSlots([{ id: 'slot-test-id', scheduledAt, totalDurationMins: 60 }]);
      const staffCtx = new RequestContextBuilder()
        .withTenantId(TENANT_A)
        .withCorrelationId(CORRELATION_ID)
        .withActorId(STAFF_ID)
        .withActorRole('MANAGER')
        .build();
      const bookingRepoB = new InMemoryBookingRepository();
      const ctrl = new BookingLifecycleController(
        staffCtx,
        new ApproveBookingUseCase(
          bookingRepoB,
          new BookingSlotConflictService(conflictPort, new InMemoryTenantDayLock()),
          new InMemoryTransactionManager(),
        ),
        new RejectBookingUseCase(bookingRepoB, new InMemoryTransactionManager()),
        new RequestMoreInfoUseCase(bookingRepoB, new InMemoryTransactionManager()),
        new SubmitBookingInfoUseCase(
          bookingRepoB,
          new InMemoryTransactionManager(),
          new PhotoExistenceService(storageService),
        ),
        new SubmitGuestBookingInfoUseCase(
          bookingRepoB,
          new InMemoryTransactionManager(),
          new PhotoExistenceService(storageService),
        ),
      );
      const booking = new BookingBuilder()
        .withTenantId(TENANT_A)
        .withScheduledAt(scheduledAt)
        .build();
      await bookingRepoB.save(booking);

      const err = await ctrl.approve(booking.id, {}).catch((e: unknown) => e);
      expect(err).toBeInstanceOf(HttpException);
      expect((err as HttpException).getStatus()).toBe(HttpStatus.CONFLICT);
    });

    it('tenant isolation: cannot approve booking from tenantB (returns 404)', async () => {
      const booking = new BookingBuilder()
        .withTenantId(TENANT_B)
        .withScheduledAt(new Date(`${futureDate(2)}T10:00:00.000Z`))
        .build();
      await bookingRepo.save(booking);

      const err = await controller.approve(booking.id, {}).catch((e: unknown) => e);
      expect(err).toBeInstanceOf(HttpException);
      expect((err as HttpException).getStatus()).toBe(HttpStatus.NOT_FOUND);
    });
  });

  describe('reject()', () => {
    const validReason = 'Service unavailable for that date';

    it('rejects a PENDING booking and returns 200 shape with rejectedAt', async () => {
      const booking = new BookingBuilder()
        .withTenantId(TENANT_A)
        .withScheduledAt(new Date(`${futureDate(2)}T10:00:00.000Z`))
        .build();
      await bookingRepo.save(booking);

      const result = await controller.reject(booking.id, { reason: validReason });
      expect(result.status).toBe(BookingStatus.REJECTED);
      expect(result.bookingId).toBe(booking.id);
      expect(result.rejectedAt).toBeDefined();
    });

    it('rejects an INFO_REQUESTED booking', async () => {
      const booking = new BookingBuilder()
        .withTenantId(TENANT_A)
        .withScheduledAt(new Date(`${futureDate(2)}T10:00:00.000Z`))
        .withStatus(BookingStatus.INFO_REQUESTED)
        .build();
      await bookingRepo.save(booking);

      const result = await controller.reject(booking.id, { reason: validReason });
      expect(result.status).toBe(BookingStatus.REJECTED);
    });

    it('maps BookingNotFoundError to 404', async () => {
      const err = await controller
        .reject('00000000-0000-4000-8000-000000009999', { reason: validReason })
        .catch((e: unknown) => e);
      expect(err).toBeInstanceOf(HttpException);
      expect((err as HttpException).getStatus()).toBe(HttpStatus.NOT_FOUND);
    });

    it('maps InvalidBookingTransitionError to 422 when booking is APPROVED', async () => {
      const booking = new BookingBuilder()
        .withTenantId(TENANT_A)
        .withStatus(BookingStatus.APPROVED)
        .withScheduledAt(new Date(`${futureDate(2)}T10:00:00.000Z`))
        .build();
      await bookingRepo.save(booking);

      const err = await controller
        .reject(booking.id, { reason: validReason })
        .catch((e: unknown) => e);
      expect(err).toBeInstanceOf(HttpException);
      expect((err as HttpException).getStatus()).toBe(HttpStatus.UNPROCESSABLE_ENTITY);
    });

    it('maps BookingRejectionReasonTooShortError to 400', async () => {
      const booking = new BookingBuilder()
        .withTenantId(TENANT_A)
        .withScheduledAt(new Date(`${futureDate(2)}T10:00:00.000Z`))
        .build();
      await bookingRepo.save(booking);

      const err = await controller.reject(booking.id, { reason: 'short' }).catch((e: unknown) => e);
      expect(err).toBeInstanceOf(HttpException);
      expect((err as HttpException).getStatus()).toBe(HttpStatus.BAD_REQUEST);
    });

    it('tenant isolation: cannot reject booking from tenantB (returns 404)', async () => {
      const booking = new BookingBuilder()
        .withTenantId(TENANT_B)
        .withScheduledAt(new Date(`${futureDate(2)}T10:00:00.000Z`))
        .build();
      await bookingRepo.save(booking);

      const err = await controller
        .reject(booking.id, { reason: validReason })
        .catch((e: unknown) => e);
      expect(err).toBeInstanceOf(HttpException);
      expect((err as HttpException).getStatus()).toBe(HttpStatus.NOT_FOUND);
    });
  });

  describe('requestInfo()', () => {
    const validMessage = 'Please provide clearer photos of the vehicle';

    it('transitions PENDING → INFO_REQUESTED and returns 200 shape', async () => {
      const booking = new BookingBuilder()
        .withTenantId(TENANT_A)
        .withScheduledAt(new Date(`${futureDate(2)}T10:00:00.000Z`))
        .build();
      await bookingRepo.save(booking);

      const result = await controller.requestInfo(booking.id, { message: validMessage });
      expect(result.status).toBe(BookingStatus.INFO_REQUESTED);
      expect(result.bookingId).toBe(booking.id);
      expect(result.infoRequestedAt).toBeDefined();
    });

    it('maps BookingNotFoundError to 404', async () => {
      const err = await controller
        .requestInfo('00000000-0000-4000-8000-000000009999', { message: validMessage })
        .catch((e: unknown) => e);
      expect(err).toBeInstanceOf(HttpException);
      expect((err as HttpException).getStatus()).toBe(HttpStatus.NOT_FOUND);
    });

    it('maps InvalidBookingTransitionError to 422 when booking is already INFO_REQUESTED', async () => {
      const booking = new BookingBuilder()
        .withTenantId(TENANT_A)
        .withStatus(BookingStatus.INFO_REQUESTED)
        .withScheduledAt(new Date(`${futureDate(2)}T10:00:00.000Z`))
        .build();
      await bookingRepo.save(booking);

      const err = await controller
        .requestInfo(booking.id, { message: validMessage })
        .catch((e: unknown) => e);
      expect(err).toBeInstanceOf(HttpException);
      expect((err as HttpException).getStatus()).toBe(HttpStatus.UNPROCESSABLE_ENTITY);
    });

    it('maps BookingInfoMessageTooShortError to 400', async () => {
      const booking = new BookingBuilder()
        .withTenantId(TENANT_A)
        .withScheduledAt(new Date(`${futureDate(2)}T10:00:00.000Z`))
        .build();
      await bookingRepo.save(booking);

      const err = await controller
        .requestInfo(booking.id, { message: 'short' })
        .catch((e: unknown) => e);
      expect(err).toBeInstanceOf(HttpException);
      expect((err as HttpException).getStatus()).toBe(HttpStatus.BAD_REQUEST);
    });

    it('tenant isolation: cannot request info on a booking from tenantB (returns 404)', async () => {
      const booking = new BookingBuilder()
        .withTenantId(TENANT_B)
        .withScheduledAt(new Date(`${futureDate(2)}T10:00:00.000Z`))
        .build();
      await bookingRepo.save(booking);

      const err = await controller
        .requestInfo(booking.id, { message: validMessage })
        .catch((e: unknown) => e);
      expect(err).toBeInstanceOf(HttpException);
      expect((err as HttpException).getStatus()).toBe(HttpStatus.NOT_FOUND);
    });
  });

  describe('submitInfo()', () => {
    const validResponse = 'Here are the photos you requested';

    it('transitions INFO_REQUESTED → PENDING and returns 200 shape', async () => {
      const booking = new BookingBuilder()
        .withTenantId(TENANT_A)
        .withCustomerId(CUSTOMER_ID)
        .withStatus(BookingStatus.INFO_REQUESTED)
        .withScheduledAt(new Date(`${futureDate(2)}T10:00:00.000Z`))
        .build();
      await bookingRepo.save(booking);

      const result = await customerController.submitInfo(booking.id, { response: validResponse });
      expect(result.status).toBe(BookingStatus.PENDING);
      expect(result.bookingId).toBe(booking.id);
      expect(result.infoSubmittedAt).toBeDefined();
    });

    it('maps BookingForbiddenError to 403 when caller is not the booking owner', async () => {
      const booking = new BookingBuilder()
        .withTenantId(TENANT_A)
        .withCustomerId('99999999-0000-4000-8000-000000000001')
        .withStatus(BookingStatus.INFO_REQUESTED)
        .withScheduledAt(new Date(`${futureDate(2)}T10:00:00.000Z`))
        .build();
      await bookingRepo.save(booking);

      const err = await controller
        .submitInfo(booking.id, { response: validResponse })
        .catch((e: unknown) => e);
      expect(err).toBeInstanceOf(HttpException);
      expect((err as HttpException).getStatus()).toBe(HttpStatus.FORBIDDEN);
    });

    it('maps BookingNotFoundError to 404', async () => {
      const err = await controller
        .submitInfo('00000000-0000-4000-8000-000000009999', { response: validResponse })
        .catch((e: unknown) => e);
      expect(err).toBeInstanceOf(HttpException);
      expect((err as HttpException).getStatus()).toBe(HttpStatus.NOT_FOUND);
    });

    it('maps InvalidBookingTransitionError to 422 when booking is not INFO_REQUESTED', async () => {
      const booking = new BookingBuilder()
        .withTenantId(TENANT_A)
        .withCustomerId(CUSTOMER_ID)
        .withStatus(BookingStatus.PENDING)
        .withScheduledAt(new Date(`${futureDate(2)}T10:00:00.000Z`))
        .build();
      await bookingRepo.save(booking);

      const err = await customerController
        .submitInfo(booking.id, { response: validResponse })
        .catch((e: unknown) => e);
      expect(err).toBeInstanceOf(HttpException);
      expect((err as HttpException).getStatus()).toBe(HttpStatus.UNPROCESSABLE_ENTITY);
    });

    it('tenant isolation: cannot submit info for a booking from tenantB (returns 404)', async () => {
      const booking = new BookingBuilder()
        .withTenantId(TENANT_B)
        .withCustomerId(CUSTOMER_ID)
        .withStatus(BookingStatus.INFO_REQUESTED)
        .withScheduledAt(new Date(`${futureDate(2)}T10:00:00.000Z`))
        .build();
      await bookingRepo.save(booking);

      const err = await controller
        .submitInfo(booking.id, { response: validResponse })
        .catch((e: unknown) => e);
      expect(err).toBeInstanceOf(HttpException);
      expect((err as HttpException).getStatus()).toBe(HttpStatus.NOT_FOUND);
    });
  });

  describe('submitInfoGuest()', () => {
    const contactEmail = 'guest@example.com';
    const validResponse = 'Here are the photos as requested';

    it('transitions INFO_REQUESTED → PENDING for a GUEST booking and returns 200 shape', async () => {
      const booking = new BookingBuilder()
        .withTenantId(TENANT_A)
        .withStatus(BookingStatus.INFO_REQUESTED)
        .withScheduledAt(new Date(`${futureDate(3)}T10:00:00.000Z`))
        .build();
      await bookingRepo.save(booking);

      const result = await controller.submitInfoGuest(booking.id, {
        contactEmail,
        response: validResponse,
      });
      expect(result.status).toBe(BookingStatus.PENDING);
      expect(result.bookingId).toBe(booking.id);
      expect(result.infoSubmittedAt).toBeDefined();
    });

    it('maps BookingForbiddenError to 403 when booking has a customerId (CUSTOMER booking)', async () => {
      const booking = new BookingBuilder()
        .withTenantId(TENANT_A)
        .withCustomerId(CUSTOMER_ID)
        .withStatus(BookingStatus.INFO_REQUESTED)
        .withScheduledAt(new Date(`${futureDate(3)}T11:00:00.000Z`))
        .build();
      await bookingRepo.save(booking);

      const err = await controller
        .submitInfoGuest(booking.id, { contactEmail, response: validResponse })
        .catch((e: unknown) => e);
      expect(err).toBeInstanceOf(HttpException);
      expect((err as HttpException).getStatus()).toBe(HttpStatus.FORBIDDEN);
    });

    it('maps BookingNotFoundError to 404', async () => {
      const err = await controller
        .submitInfoGuest('00000000-0000-4000-8000-000000009999', {
          contactEmail,
          response: validResponse,
        })
        .catch((e: unknown) => e);
      expect(err).toBeInstanceOf(HttpException);
      expect((err as HttpException).getStatus()).toBe(HttpStatus.NOT_FOUND);
    });

    it('maps InvalidBookingTransitionError to 422 when booking is not INFO_REQUESTED', async () => {
      const booking = new BookingBuilder()
        .withTenantId(TENANT_A)
        .withStatus(BookingStatus.PENDING)
        .withScheduledAt(new Date(`${futureDate(3)}T12:00:00.000Z`))
        .build();
      await bookingRepo.save(booking);

      const err = await controller
        .submitInfoGuest(booking.id, { contactEmail, response: validResponse })
        .catch((e: unknown) => e);
      expect(err).toBeInstanceOf(HttpException);
      expect((err as HttpException).getStatus()).toBe(HttpStatus.UNPROCESSABLE_ENTITY);
    });

    it('tenant isolation: cannot submit guest info for a booking from tenantB (returns 404)', async () => {
      const booking = new BookingBuilder()
        .withTenantId(TENANT_B)
        .withStatus(BookingStatus.INFO_REQUESTED)
        .withScheduledAt(new Date(`${futureDate(3)}T13:00:00.000Z`))
        .build();
      await bookingRepo.save(booking);

      const err = await controller
        .submitInfoGuest(booking.id, { contactEmail, response: validResponse })
        .catch((e: unknown) => e);
      expect(err).toBeInstanceOf(HttpException);
      expect((err as HttpException).getStatus()).toBe(HttpStatus.NOT_FOUND);
    });
  });
});
