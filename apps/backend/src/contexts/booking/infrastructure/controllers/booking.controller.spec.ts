import { HttpException, HttpStatus } from '@nestjs/common';
import { InMemoryTransactionManager } from '../../../../test/infrastructure/in-memory-transaction-manager';
import { InMemoryBookingAvailabilityPort } from '../../../../test/infrastructure/in-memory-booking-availability';
import { InMemoryBookingCustomerPort } from '../../../../test/infrastructure/in-memory-booking-customer.port';
import { InMemoryStorageService } from '../../../../test/infrastructure/in-memory-storage.service';
import { InMemoryBookingRepository } from '../../../../test/repositories/booking/in-memory-booking.repository';
import { InMemoryServiceRepository } from '../../../../test/repositories/booking/in-memory-service.repository';
import { BookingBuilder, ServiceBuilder } from '../../../../test/builders/booking/index';
import { RequestContextBuilder } from '../../../../test/factories/request-context.factory';
import { futureDate } from '../../../../test/utils/date-helpers';
import { BookingController } from './booking.controller';
import { RequestBookingUseCase } from '../../application/use-cases/request-booking.use-case';
import { RequestAuthenticatedBookingUseCase } from '../../application/use-cases/request-authenticated-booking.use-case';
import { ApproveBookingUseCase } from '../../application/use-cases/approve-booking.use-case';
import { RejectBookingUseCase } from '../../application/use-cases/reject-booking.use-case';
import { RequestMoreInfoUseCase } from '../../application/use-cases/request-more-info.use-case';
import { SubmitBookingInfoUseCase } from '../../application/use-cases/submit-booking-info.use-case';
import { SubmitGuestBookingInfoUseCase } from '../../application/use-cases/submit-guest-booking-info.use-case';
import { ListBookingsUseCase } from '../../application/use-cases/list-bookings.use-case';
import { GetBookingByIdUseCase } from '../../application/use-cases/get-booking-by-id.use-case';
import { CancelBookingAsCustomerUseCase } from '../../application/use-cases/cancel-booking-as-customer.use-case';
import { CancelBookingAsAdminUseCase } from '../../application/use-cases/cancel-booking-as-admin.use-case';
import { RescheduleBookingUseCase } from '../../application/use-cases/reschedule-booking.use-case';
import { CompleteBookingUseCase } from '../../application/use-cases/complete-booking.use-case';
import { BookingSlotConflictService } from '../../application/services/booking-slot-conflict.service';
import { PhotoExistenceService } from '../../application/services/photo-existence.service';
import { BookingStatus } from '../../domain/booking.aggregate';
import { BookingLineBuilder } from '../../../../test/builders/booking/booking-line.builder';
import { Money } from '../../../../shared/value-objects/money';

const TENANT_A = '10000000-0000-4000-8000-000000000110';
const TENANT_B = '10000000-0000-4000-8000-000000000111';
const CUSTOMER_ID = '20000000-0000-4000-8000-000000000110';
const STAFF_ID = '20000000-0000-4000-8000-000000000112';
const CORRELATION_ID = 'corr-booking-ctrl-test';

describe('BookingController', () => {
  let controller: BookingController;
  let customerController: BookingController;
  let serviceRepo: InMemoryServiceRepository;
  let bookingRepo: InMemoryBookingRepository;
  let storageService: InMemoryStorageService;
  let serviceId: string;

  beforeEach(async () => {
    serviceRepo = new InMemoryServiceRepository();
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
    const customerProfilePort = new InMemoryBookingCustomerPort();
    customerProfilePort.setProfile(CUSTOMER_ID, {
      email: 'cliente@example.com',
      name: 'Maria Silva',
      phone: '+5531988888888',
      defaultAddress: null,
    });

    const makeUseCases = (repo: InMemoryBookingRepository) => ({
      requestBooking: new RequestBookingUseCase(
        serviceRepo,
        new BookingSlotConflictService(new InMemoryBookingAvailabilityPort()),
        new PhotoExistenceService(storageService),
        repo,
        new InMemoryTransactionManager(),
      ),
      requestAuthenticatedBooking: new RequestAuthenticatedBookingUseCase(
        customerProfilePort,
        serviceRepo,
        new BookingSlotConflictService(new InMemoryBookingAvailabilityPort()),
        new PhotoExistenceService(storageService),
        repo,
        new InMemoryTransactionManager(),
      ),
      approveBooking: new ApproveBookingUseCase(
        repo,
        new BookingSlotConflictService(new InMemoryBookingAvailabilityPort()),
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
      listBookings: new ListBookingsUseCase(repo),
      getBooking: new GetBookingByIdUseCase(repo, storageService),
      cancelBookingAsCustomer: new CancelBookingAsCustomerUseCase(
        repo,
        new InMemoryTransactionManager(),
      ),
      cancelBookingAsAdmin: new CancelBookingAsAdminUseCase(repo, new InMemoryTransactionManager()),
      rescheduleBooking: new RescheduleBookingUseCase(
        repo,
        new BookingSlotConflictService(new InMemoryBookingAvailabilityPort()),
        new InMemoryTransactionManager(),
      ),
      completeBooking: new CompleteBookingUseCase(
        repo,
        new InMemoryTransactionManager(),
        new PhotoExistenceService(storageService),
      ),
    });

    const uc = makeUseCases(bookingRepo);
    controller = new BookingController(
      staffCtx,
      uc.requestBooking,
      uc.requestAuthenticatedBooking,
      uc.approveBooking,
      uc.rejectBooking,
      uc.requestMoreInfo,
      uc.submitBookingInfo,
      uc.submitGuestBookingInfo,
      uc.listBookings,
      uc.getBooking,
      uc.cancelBookingAsCustomer,
      uc.cancelBookingAsAdmin,
      uc.rescheduleBooking,
      uc.completeBooking,
    );
    const ucC = makeUseCases(bookingRepo);
    customerController = new BookingController(
      customerCtx,
      ucC.requestBooking,
      ucC.requestAuthenticatedBooking,
      ucC.approveBooking,
      ucC.rejectBooking,
      ucC.requestMoreInfo,
      ucC.submitBookingInfo,
      ucC.submitGuestBookingInfo,
      ucC.listBookings,
      ucC.getBooking,
      ucC.cancelBookingAsCustomer,
      ucC.cancelBookingAsAdmin,
      ucC.rescheduleBooking,
      ucC.completeBooking,
    );
    const service = new ServiceBuilder().withTenantId(TENANT_A).build();
    await serviceRepo.save(service);
    serviceId = service.id;
  });

  const validBody = () => ({
    contactEmail: 'guest@example.com',
    contactName: 'João Silva',
    contactPhone: '+5531999999999',
    scheduledAt: `${futureDate(1)}T10:00:00.000Z`,
    serviceIds: [serviceId],
  });

  describe('create()', () => {
    it('returns 201 with bookingId and PENDING status', async () => {
      const result = await controller.create(validBody());
      expect(result.bookingId).toBeDefined();
      expect(result.status).toBe('PENDING');
      expect(result.lines).toHaveLength(1);
    });

    it('maps BookingSlotUnavailableError to 409', async () => {
      const conflictPort = new InMemoryBookingAvailabilityPort();
      conflictPort.setSlots([
        {
          id: 'slot-test-id',
          scheduledAt: new Date(`${futureDate(1)}T10:00:00.000Z`),
          totalDurationMins: 30,
        },
      ]);
      const ctx = new RequestContextBuilder()
        .withTenantId(TENANT_A)
        .withCorrelationId(CORRELATION_ID)
        .build();
      const repoB = new InMemoryBookingRepository();
      const ctrl = new BookingController(
        ctx,
        new RequestBookingUseCase(
          serviceRepo,
          new BookingSlotConflictService(conflictPort),
          new PhotoExistenceService(storageService),
          repoB,
          new InMemoryTransactionManager(),
        ),
        new RequestAuthenticatedBookingUseCase(
          new InMemoryBookingCustomerPort(),
          serviceRepo,
          new BookingSlotConflictService(new InMemoryBookingAvailabilityPort()),
          new PhotoExistenceService(storageService),
          repoB,
          new InMemoryTransactionManager(),
        ),
        new ApproveBookingUseCase(
          repoB,
          new BookingSlotConflictService(new InMemoryBookingAvailabilityPort()),
          new InMemoryTransactionManager(),
        ),
        new RejectBookingUseCase(repoB, new InMemoryTransactionManager()),
        new RequestMoreInfoUseCase(repoB, new InMemoryTransactionManager()),
        new SubmitBookingInfoUseCase(
          repoB,
          new InMemoryTransactionManager(),
          new PhotoExistenceService(storageService),
        ),
        new SubmitGuestBookingInfoUseCase(
          repoB,
          new InMemoryTransactionManager(),
          new PhotoExistenceService(storageService),
        ),
        new ListBookingsUseCase(repoB),
        new GetBookingByIdUseCase(repoB, storageService),
        new CancelBookingAsCustomerUseCase(repoB, new InMemoryTransactionManager()),
        new CancelBookingAsAdminUseCase(repoB, new InMemoryTransactionManager()),
        new RescheduleBookingUseCase(
          repoB,
          new BookingSlotConflictService(new InMemoryBookingAvailabilityPort()),
          new InMemoryTransactionManager(),
        ),
        new CompleteBookingUseCase(
          repoB,
          new InMemoryTransactionManager(),
          new PhotoExistenceService(storageService),
        ),
      );
      const err = await ctrl.create(validBody()).catch((e: unknown) => e);
      expect(err).toBeInstanceOf(HttpException);
      expect((err as HttpException).getStatus()).toBe(HttpStatus.CONFLICT);
    });

    it('maps BookingServiceNotInTenantError to 400', async () => {
      const err = await controller
        .create({ ...validBody(), serviceIds: ['00000000-0000-4000-8000-000000009999'] })
        .catch((e: unknown) => e);
      expect(err).toBeInstanceOf(HttpException);
      expect((err as HttpException).getStatus()).toBe(HttpStatus.BAD_REQUEST);
    });
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
      const ctrl = new BookingController(
        staffCtx,
        new RequestBookingUseCase(
          serviceRepo,
          new BookingSlotConflictService(new InMemoryBookingAvailabilityPort()),
          new PhotoExistenceService(storageService),
          bookingRepoB,
          new InMemoryTransactionManager(),
        ),
        new RequestAuthenticatedBookingUseCase(
          new InMemoryBookingCustomerPort(),
          serviceRepo,
          new BookingSlotConflictService(new InMemoryBookingAvailabilityPort()),
          new PhotoExistenceService(storageService),
          bookingRepoB,
          new InMemoryTransactionManager(),
        ),
        new ApproveBookingUseCase(
          bookingRepoB,
          new BookingSlotConflictService(conflictPort),
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
        new ListBookingsUseCase(bookingRepoB),
        new GetBookingByIdUseCase(bookingRepoB, storageService),
        new CancelBookingAsCustomerUseCase(bookingRepoB, new InMemoryTransactionManager()),
        new CancelBookingAsAdminUseCase(bookingRepoB, new InMemoryTransactionManager()),
        new RescheduleBookingUseCase(
          bookingRepoB,
          new BookingSlotConflictService(conflictPort),
          new InMemoryTransactionManager(),
        ),
        new CompleteBookingUseCase(
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

  describe('createAuthenticated()', () => {
    const authBody = () => ({
      scheduledAt: `${futureDate(1)}T10:00:00.000Z`,
      serviceIds: [serviceId],
    });

    it('creates a CUSTOMER booking and returns 201 shape', async () => {
      const result = await customerController.createAuthenticated(authBody());
      expect(result.bookingId).toBeDefined();
      expect(result.status).toBe('PENDING');
      expect(result.lines).toHaveLength(1);
    });

    it('maps CustomerPhoneNotSetError to 422', async () => {
      const { CustomerPhoneNotSetError } = await import('../../domain/errors/booking-domain.error');
      const noPhonePort = new InMemoryBookingCustomerPort();
      noPhonePort.setProfile(CUSTOMER_ID, {
        email: 'nophone@example.com',
        name: 'Sem Telefone',
        phone: null,
        defaultAddress: null,
      });
      const ctx = new RequestContextBuilder()
        .withTenantId(TENANT_A)
        .withCorrelationId(CORRELATION_ID)
        .withActorId(CUSTOMER_ID)
        .withActorType('CUSTOMER')
        .build();
      const repoC = new InMemoryBookingRepository();
      const ctrl = new BookingController(
        ctx,
        new RequestBookingUseCase(
          serviceRepo,
          new BookingSlotConflictService(new InMemoryBookingAvailabilityPort()),
          new PhotoExistenceService(storageService),
          repoC,
          new InMemoryTransactionManager(),
        ),
        new RequestAuthenticatedBookingUseCase(
          noPhonePort,
          serviceRepo,
          new BookingSlotConflictService(new InMemoryBookingAvailabilityPort()),
          new PhotoExistenceService(storageService),
          repoC,
          new InMemoryTransactionManager(),
        ),
        new ApproveBookingUseCase(
          repoC,
          new BookingSlotConflictService(new InMemoryBookingAvailabilityPort()),
          new InMemoryTransactionManager(),
        ),
        new RejectBookingUseCase(repoC, new InMemoryTransactionManager()),
        new RequestMoreInfoUseCase(repoC, new InMemoryTransactionManager()),
        new SubmitBookingInfoUseCase(
          repoC,
          new InMemoryTransactionManager(),
          new PhotoExistenceService(storageService),
        ),
        new SubmitGuestBookingInfoUseCase(
          repoC,
          new InMemoryTransactionManager(),
          new PhotoExistenceService(storageService),
        ),
        new ListBookingsUseCase(repoC),
        new GetBookingByIdUseCase(repoC, storageService),
        new CancelBookingAsCustomerUseCase(repoC, new InMemoryTransactionManager()),
        new CancelBookingAsAdminUseCase(repoC, new InMemoryTransactionManager()),
        new RescheduleBookingUseCase(
          repoC,
          new BookingSlotConflictService(new InMemoryBookingAvailabilityPort()),
          new InMemoryTransactionManager(),
        ),
        new CompleteBookingUseCase(
          repoC,
          new InMemoryTransactionManager(),
          new PhotoExistenceService(storageService),
        ),
      );
      const err = await ctrl.createAuthenticated(authBody()).catch((e: unknown) => e);
      expect(err).toBeInstanceOf(HttpException);
      expect((err as HttpException).getStatus()).toBe(HttpStatus.UNPROCESSABLE_ENTITY);
      expect(err).not.toBeInstanceOf(CustomerPhoneNotSetError);
    });
  });

  describe('cancelAsAdmin()', () => {
    it('cancels a PENDING booking and returns CANCELLED status', async () => {
      const booking = new BookingBuilder().withTenantId(TENANT_A).build();
      await bookingRepo.save(booking);

      const result = await controller.cancelAsAdmin(booking.id, {});
      expect(result.status).toBe(BookingStatus.CANCELLED);
      expect(result.bookingId).toBe(booking.id);
    });

    it('cancels an APPROVED booking scheduled in 1 hour (no window constraint)', async () => {
      const nearFuture = new Date(Date.now() + 60 * 60_000);
      const booking = new BookingBuilder()
        .withTenantId(TENANT_A)
        .withStatus(BookingStatus.APPROVED)
        .withScheduledAt(nearFuture)
        .build();
      await bookingRepo.save(booking);

      const result = await controller.cancelAsAdmin(booking.id, {});
      expect(result.status).toBe(BookingStatus.CANCELLED);
    });

    it('passes optional reason to the use case', async () => {
      const booking = new BookingBuilder().withTenantId(TENANT_A).build();
      await bookingRepo.save(booking);

      const result = await controller.cancelAsAdmin(booking.id, { reason: 'Staff unavailable' });
      expect(result.status).toBe(BookingStatus.CANCELLED);
    });

    it('maps BookingNotFoundError to 404', async () => {
      const err = await controller
        .cancelAsAdmin('00000000-0000-4000-8000-000000009999', {})
        .catch((e: unknown) => e);
      expect(err).toBeInstanceOf(HttpException);
      expect((err as HttpException).getStatus()).toBe(HttpStatus.NOT_FOUND);
    });

    it('maps InvalidBookingTransitionError to 422 when booking is COMPLETED', async () => {
      const booking = new BookingBuilder()
        .withTenantId(TENANT_A)
        .withStatus(BookingStatus.COMPLETED)
        .build();
      await bookingRepo.save(booking);

      const err = await controller.cancelAsAdmin(booking.id, {}).catch((e: unknown) => e);
      expect(err).toBeInstanceOf(HttpException);
      expect((err as HttpException).getStatus()).toBe(HttpStatus.UNPROCESSABLE_ENTITY);
    });

    it('tenant isolation: cannot cancel a booking from tenantB (returns 404)', async () => {
      const booking = new BookingBuilder().withTenantId(TENANT_B).build();
      await bookingRepo.save(booking);

      const err = await controller.cancelAsAdmin(booking.id, {}).catch((e: unknown) => e);
      expect(err).toBeInstanceOf(HttpException);
      expect((err as HttpException).getStatus()).toBe(HttpStatus.NOT_FOUND);
    });
  });

  describe('list()', () => {
    it('returns paginated result with items and pagination metadata', async () => {
      const booking = new BookingBuilder().withTenantId(TENANT_A).build();
      await bookingRepo.save(booking);

      const result = await controller.list({ limit: 25, offset: 0 });

      expect(result.items).toHaveLength(1);
      expect(result.items[0].id).toBe(booking.id);
      expect(result.pagination.total).toBe(1);
      expect(result.pagination.hasMore).toBe(false);
    });

    it('returns empty list when no bookings exist', async () => {
      const result = await controller.list({ limit: 25, offset: 0 });
      expect(result.items).toHaveLength(0);
      expect(result.pagination.total).toBe(0);
    });
  });

  describe('getOne()', () => {
    it('returns booking detail for existing booking', async () => {
      const booking = new BookingBuilder().withTenantId(TENANT_A).build();
      await bookingRepo.save(booking);

      const result = await controller.getOne(booking.id);

      expect(result.id).toBe(booking.id);
      expect(result.contactEmail).toBe(booking.contactEmail.address);
      expect(result.lines).toHaveLength(1);
    });

    it('maps BookingNotFoundError to 404', async () => {
      const err = await controller
        .getOne('00000000-0000-4000-8000-000000009999')
        .catch((e: unknown) => e);
      expect(err).toBeInstanceOf(HttpException);
      expect((err as HttpException).getStatus()).toBe(HttpStatus.NOT_FOUND);
    });

    it('sets cancellableUntil from the tenant cancellationWindowHours setting for APPROVED bookings', async () => {
      const scheduledAt = new Date('2026-08-10T14:00:00.000Z');
      const booking = new BookingBuilder()
        .withTenantId(TENANT_A)
        .withStatus(BookingStatus.APPROVED)
        .withScheduledAt(scheduledAt)
        .build();
      await bookingRepo.save(booking);

      const result = await controller.getOne(booking.id);

      expect(result.cancellableUntil).toBe(
        new Date(scheduledAt.getTime() - 48 * 60 * 60 * 1000).toISOString(),
      );
    });
  });

  describe('complete()', () => {
    const LINE_ID = '30000000-0000-4000-8000-000000000110';

    function approvedBookingWithLine() {
      const line = new BookingLineBuilder()
        .withLineId(LINE_ID)
        .withPriceAtBooking(Money.from(100, 'BRL'))
        .build();
      return new BookingBuilder()
        .withTenantId(TENANT_A)
        .withStatus(BookingStatus.APPROVED)
        .withLines([line])
        .withTotalPrice(Money.from(100, 'BRL'))
        .build();
    }

    it('completes an APPROVED booking and returns 200 shape', async () => {
      const booking = approvedBookingWithLine();
      await bookingRepo.save(booking);

      const result = await controller.complete(booking.id, {
        lines: [{ lineId: LINE_ID, actualPriceCharged: 80 }],
        afterServicePhotoUrls: [],
      });

      expect(result.status).toBe(BookingStatus.COMPLETED);
      expect(result.bookingId).toBe(booking.id);
      expect(result.completedAt).toBeDefined();
      expect(result.totalActualPrice.amount).toBe(80);
    });

    it('maps BookingNotFoundError to 404', async () => {
      const err = await controller
        .complete('00000000-0000-4000-8000-000000009999', {
          lines: [{ lineId: LINE_ID, actualPriceCharged: 100 }],
          afterServicePhotoUrls: [],
        })
        .catch((e: unknown) => e);
      expect(err).toBeInstanceOf(HttpException);
      expect((err as HttpException).getStatus()).toBe(HttpStatus.NOT_FOUND);
    });

    it('maps InvalidBookingTransitionError to 422 when booking is PENDING', async () => {
      const line = new BookingLineBuilder().withLineId(LINE_ID).build();
      const booking = new BookingBuilder()
        .withTenantId(TENANT_A)
        .withStatus(BookingStatus.PENDING)
        .withLines([line])
        .build();
      await bookingRepo.save(booking);

      const err = await controller
        .complete(booking.id, {
          lines: [{ lineId: LINE_ID, actualPriceCharged: 100 }],
          afterServicePhotoUrls: [],
        })
        .catch((e: unknown) => e);
      expect(err).toBeInstanceOf(HttpException);
      expect((err as HttpException).getStatus()).toBe(HttpStatus.UNPROCESSABLE_ENTITY);
    });

    it('maps CompleteBookingLinesIncompleteError to 400 when a line is missing', async () => {
      const booking = approvedBookingWithLine();
      await bookingRepo.save(booking);

      const err = await controller
        .complete(booking.id, { lines: [], afterServicePhotoUrls: [] })
        .catch((e: unknown) => e);
      expect(err).toBeInstanceOf(HttpException);
      expect((err as HttpException).getStatus()).toBe(HttpStatus.BAD_REQUEST);
    });

    it('tenant isolation: cannot complete a booking from tenantB (returns 404)', async () => {
      const line = new BookingLineBuilder().withLineId(LINE_ID).build();
      const booking = new BookingBuilder()
        .withTenantId(TENANT_B)
        .withStatus(BookingStatus.APPROVED)
        .withLines([line])
        .build();
      await bookingRepo.save(booking);

      const err = await controller
        .complete(booking.id, {
          lines: [{ lineId: LINE_ID, actualPriceCharged: 100 }],
          afterServicePhotoUrls: [],
        })
        .catch((e: unknown) => e);
      expect(err).toBeInstanceOf(HttpException);
      expect((err as HttpException).getStatus()).toBe(HttpStatus.NOT_FOUND);
    });

    it('forwards discountByPoints to the use case (rejected here since the tenant rate is 0)', async () => {
      const booking = approvedBookingWithLine();
      await bookingRepo.save(booking);

      const err = await controller
        .complete(booking.id, {
          lines: [{ lineId: LINE_ID, actualPriceCharged: 100 }],
          afterServicePhotoUrls: [],
          discountByPoints: { pointsUsed: 100, amountDeducted: 10 },
        })
        .catch((e: unknown) => e);
      expect(err).toBeInstanceOf(HttpException);
      expect((err as HttpException).getStatus()).toBe(HttpStatus.UNPROCESSABLE_ENTITY);
    });
  });
});
