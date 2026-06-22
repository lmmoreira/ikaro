import { HttpException, HttpStatus } from '@nestjs/common';
import { InMemoryEventBus } from '../../../../test/infrastructure/in-memory-event-bus';
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
import { GetBookingUseCase } from '../../application/use-cases/get-booking.use-case';
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
  let serviceRepo: InMemoryServiceRepository;
  let bookingRepo: InMemoryBookingRepository;
  let storageService: InMemoryStorageService;
  let serviceId: string;

  beforeEach(async () => {
    serviceRepo = new InMemoryServiceRepository();
    bookingRepo = new InMemoryBookingRepository();
    storageService = new InMemoryStorageService();
    const guestCtx = new RequestContextBuilder()
      .withTenantId(TENANT_A)
      .withCorrelationId(CORRELATION_ID)
      .build();
    const customerCtx = new RequestContextBuilder()
      .withTenantId(TENANT_A)
      .withCorrelationId(CORRELATION_ID)
      .withActorId(CUSTOMER_ID)
      .withActorType('CUSTOMER')
      .withActorRole('CUSTOMER')
      .build();
    const staffCtx = new RequestContextBuilder()
      .withTenantId(TENANT_A)
      .withCorrelationId(CORRELATION_ID)
      .withActorId(STAFF_ID)
      .withActorRole('MANAGER')
      .build();
    const customerProfilePort = new InMemoryBookingCustomerPort();
    customerProfilePort.setProfile(CUSTOMER_ID, {
      email: 'cliente@example.com',
      name: 'Maria Silva',
      phone: '+5531988888888',
      defaultAddress: null,
    });
    controller = new BookingController(
      new RequestBookingUseCase(
        serviceRepo,
        new BookingSlotConflictService(new InMemoryBookingAvailabilityPort(), guestCtx),
        new PhotoExistenceService(storageService),
        bookingRepo,
        new InMemoryTransactionManager(),
        new InMemoryEventBus(),
        guestCtx,
      ),
      new RequestAuthenticatedBookingUseCase(
        customerProfilePort,
        serviceRepo,
        new BookingSlotConflictService(new InMemoryBookingAvailabilityPort(), customerCtx),
        new PhotoExistenceService(storageService),
        bookingRepo,
        new InMemoryTransactionManager(),
        new InMemoryEventBus(),
        customerCtx,
      ),
      new ApproveBookingUseCase(
        staffCtx,
        bookingRepo,
        new BookingSlotConflictService(new InMemoryBookingAvailabilityPort(), staffCtx),
        new InMemoryTransactionManager(),
        new InMemoryEventBus(),
      ),
      new RejectBookingUseCase(
        staffCtx,
        bookingRepo,
        new InMemoryTransactionManager(),
        new InMemoryEventBus(),
      ),
      new RequestMoreInfoUseCase(
        staffCtx,
        bookingRepo,
        new InMemoryTransactionManager(),
        new InMemoryEventBus(),
      ),
      new SubmitBookingInfoUseCase(
        customerCtx,
        bookingRepo,
        new InMemoryTransactionManager(),
        new InMemoryEventBus(),
        new PhotoExistenceService(storageService),
      ),
      new SubmitGuestBookingInfoUseCase(
        guestCtx,
        bookingRepo,
        new InMemoryTransactionManager(),
        new InMemoryEventBus(),
        new PhotoExistenceService(storageService),
      ),
      new ListBookingsUseCase(bookingRepo, staffCtx),
      new GetBookingUseCase(bookingRepo, staffCtx, storageService),
      new CancelBookingAsCustomerUseCase(
        customerCtx,
        bookingRepo,
        new InMemoryTransactionManager(),
        new InMemoryEventBus(),
      ),
      new CancelBookingAsAdminUseCase(
        staffCtx,
        bookingRepo,
        new InMemoryTransactionManager(),
        new InMemoryEventBus(),
      ),
      new RescheduleBookingUseCase(
        staffCtx,
        bookingRepo,
        new BookingSlotConflictService(new InMemoryBookingAvailabilityPort(), staffCtx),
        new InMemoryTransactionManager(),
        new InMemoryEventBus(),
      ),
      new CompleteBookingUseCase(
        staffCtx,
        bookingRepo,
        new InMemoryTransactionManager(),
        new InMemoryEventBus(),
        new PhotoExistenceService(storageService),
      ),
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
      const staffCtxB = new RequestContextBuilder()
        .withTenantId(TENANT_A)
        .withActorId(STAFF_ID)
        .build();
      const repoB = new InMemoryBookingRepository();
      const customerCtxB = new RequestContextBuilder()
        .withTenantId(TENANT_A)
        .withActorId(CUSTOMER_ID)
        .withActorType('CUSTOMER')
        .withActorRole('CUSTOMER')
        .build();
      const ctrl = new BookingController(
        new RequestBookingUseCase(
          serviceRepo,
          new BookingSlotConflictService(conflictPort, ctx),
          new PhotoExistenceService(storageService),
          repoB,
          new InMemoryTransactionManager(),
          new InMemoryEventBus(),
          ctx,
        ),
        new RequestAuthenticatedBookingUseCase(
          new InMemoryBookingCustomerPort(),
          serviceRepo,
          new BookingSlotConflictService(new InMemoryBookingAvailabilityPort(), ctx),
          new PhotoExistenceService(storageService),
          repoB,
          new InMemoryTransactionManager(),
          new InMemoryEventBus(),
          ctx,
        ),
        new ApproveBookingUseCase(
          staffCtxB,
          repoB,
          new BookingSlotConflictService(new InMemoryBookingAvailabilityPort(), staffCtxB),
          new InMemoryTransactionManager(),
          new InMemoryEventBus(),
        ),
        new RejectBookingUseCase(
          staffCtxB,
          repoB,
          new InMemoryTransactionManager(),
          new InMemoryEventBus(),
        ),
        new RequestMoreInfoUseCase(
          staffCtxB,
          repoB,
          new InMemoryTransactionManager(),
          new InMemoryEventBus(),
        ),
        new SubmitBookingInfoUseCase(
          customerCtxB,
          repoB,
          new InMemoryTransactionManager(),
          new InMemoryEventBus(),
          new PhotoExistenceService(storageService),
        ),
        new SubmitGuestBookingInfoUseCase(
          ctx,
          repoB,
          new InMemoryTransactionManager(),
          new InMemoryEventBus(),
          new PhotoExistenceService(storageService),
        ),
        new ListBookingsUseCase(repoB, ctx),
        new GetBookingUseCase(repoB, ctx, storageService),
        new CancelBookingAsCustomerUseCase(
          customerCtxB,
          repoB,
          new InMemoryTransactionManager(),
          new InMemoryEventBus(),
        ),
        new CancelBookingAsAdminUseCase(
          staffCtxB,
          repoB,
          new InMemoryTransactionManager(),
          new InMemoryEventBus(),
        ),
        new RescheduleBookingUseCase(
          staffCtxB,
          repoB,
          new BookingSlotConflictService(new InMemoryBookingAvailabilityPort(), staffCtxB),
          new InMemoryTransactionManager(),
          new InMemoryEventBus(),
        ),
        new CompleteBookingUseCase(
          staffCtxB,
          repoB,
          new InMemoryTransactionManager(),
          new InMemoryEventBus(),
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

      const result = await controller.approve(booking.id);
      expect(result.status).toBe(BookingStatus.APPROVED);
      expect(result.bookingId).toBe(booking.id);
      expect(result.approvedAt).toBeDefined();
    });

    it('maps BookingNotFoundError to 404', async () => {
      const err = await controller
        .approve('00000000-0000-4000-8000-000000009999')
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

      const err = await controller.approve(booking.id).catch((e: unknown) => e);
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
      const customerCtxC = new RequestContextBuilder()
        .withTenantId(TENANT_A)
        .withActorId(CUSTOMER_ID)
        .withActorType('CUSTOMER')
        .withActorRole('CUSTOMER')
        .build();
      const ctrl = new BookingController(
        new RequestBookingUseCase(
          serviceRepo,
          new BookingSlotConflictService(new InMemoryBookingAvailabilityPort(), staffCtx),
          new PhotoExistenceService(storageService),
          bookingRepoB,
          new InMemoryTransactionManager(),
          new InMemoryEventBus(),
          new RequestContextBuilder().withTenantId(TENANT_A).build(),
        ),
        new RequestAuthenticatedBookingUseCase(
          new InMemoryBookingCustomerPort(),
          serviceRepo,
          new BookingSlotConflictService(new InMemoryBookingAvailabilityPort(), staffCtx),
          new PhotoExistenceService(storageService),
          bookingRepoB,
          new InMemoryTransactionManager(),
          new InMemoryEventBus(),
          new RequestContextBuilder().withTenantId(TENANT_A).build(),
        ),
        new ApproveBookingUseCase(
          staffCtx,
          bookingRepoB,
          new BookingSlotConflictService(conflictPort, staffCtx),
          new InMemoryTransactionManager(),
          new InMemoryEventBus(),
        ),
        new RejectBookingUseCase(
          staffCtx,
          bookingRepoB,
          new InMemoryTransactionManager(),
          new InMemoryEventBus(),
        ),
        new RequestMoreInfoUseCase(
          staffCtx,
          bookingRepoB,
          new InMemoryTransactionManager(),
          new InMemoryEventBus(),
        ),
        new SubmitBookingInfoUseCase(
          customerCtxC,
          bookingRepoB,
          new InMemoryTransactionManager(),
          new InMemoryEventBus(),
          new PhotoExistenceService(storageService),
        ),
        new SubmitGuestBookingInfoUseCase(
          new RequestContextBuilder().withTenantId(TENANT_A).build(),
          bookingRepoB,
          new InMemoryTransactionManager(),
          new InMemoryEventBus(),
          new PhotoExistenceService(storageService),
        ),
        new ListBookingsUseCase(bookingRepoB, staffCtx),
        new GetBookingUseCase(bookingRepoB, staffCtx, storageService),
        new CancelBookingAsCustomerUseCase(
          customerCtxC,
          bookingRepoB,
          new InMemoryTransactionManager(),
          new InMemoryEventBus(),
        ),
        new CancelBookingAsAdminUseCase(
          staffCtx,
          bookingRepoB,
          new InMemoryTransactionManager(),
          new InMemoryEventBus(),
        ),
        new RescheduleBookingUseCase(
          staffCtx,
          bookingRepoB,
          new BookingSlotConflictService(conflictPort, staffCtx),
          new InMemoryTransactionManager(),
          new InMemoryEventBus(),
        ),
        new CompleteBookingUseCase(
          staffCtx,
          bookingRepoB,
          new InMemoryTransactionManager(),
          new InMemoryEventBus(),
          new PhotoExistenceService(storageService),
        ),
      );
      const booking = new BookingBuilder()
        .withTenantId(TENANT_A)
        .withScheduledAt(scheduledAt)
        .build();
      await bookingRepoB.save(booking);

      const err = await ctrl.approve(booking.id).catch((e: unknown) => e);
      expect(err).toBeInstanceOf(HttpException);
      expect((err as HttpException).getStatus()).toBe(HttpStatus.CONFLICT);
    });

    it('tenant isolation: cannot approve booking from tenantB (returns 404)', async () => {
      const booking = new BookingBuilder()
        .withTenantId(TENANT_B)
        .withScheduledAt(new Date(`${futureDate(2)}T10:00:00.000Z`))
        .build();
      await bookingRepo.save(booking);

      const err = await controller.approve(booking.id).catch((e: unknown) => e);
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

      const result = await controller.submitInfo(booking.id, { response: validResponse });
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

      const err = await controller
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
      const result = await controller.createAuthenticated(authBody());
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
      const staffCtxC = new RequestContextBuilder()
        .withTenantId(TENANT_A)
        .withActorId(STAFF_ID)
        .build();
      const repoC = new InMemoryBookingRepository();
      const ctrl = new BookingController(
        new RequestBookingUseCase(
          serviceRepo,
          new BookingSlotConflictService(new InMemoryBookingAvailabilityPort(), ctx),
          new PhotoExistenceService(storageService),
          repoC,
          new InMemoryTransactionManager(),
          new InMemoryEventBus(),
          ctx,
        ),
        new RequestAuthenticatedBookingUseCase(
          noPhonePort,
          serviceRepo,
          new BookingSlotConflictService(new InMemoryBookingAvailabilityPort(), ctx),
          new PhotoExistenceService(storageService),
          repoC,
          new InMemoryTransactionManager(),
          new InMemoryEventBus(),
          ctx,
        ),
        new ApproveBookingUseCase(
          staffCtxC,
          repoC,
          new BookingSlotConflictService(new InMemoryBookingAvailabilityPort(), staffCtxC),
          new InMemoryTransactionManager(),
          new InMemoryEventBus(),
        ),
        new RejectBookingUseCase(
          staffCtxC,
          repoC,
          new InMemoryTransactionManager(),
          new InMemoryEventBus(),
        ),
        new RequestMoreInfoUseCase(
          staffCtxC,
          repoC,
          new InMemoryTransactionManager(),
          new InMemoryEventBus(),
        ),
        new SubmitBookingInfoUseCase(
          ctx,
          repoC,
          new InMemoryTransactionManager(),
          new InMemoryEventBus(),
          new PhotoExistenceService(storageService),
        ),
        new SubmitGuestBookingInfoUseCase(
          ctx,
          repoC,
          new InMemoryTransactionManager(),
          new InMemoryEventBus(),
          new PhotoExistenceService(storageService),
        ),
        new ListBookingsUseCase(repoC, ctx),
        new GetBookingUseCase(repoC, ctx, storageService),
        new CancelBookingAsCustomerUseCase(
          ctx,
          repoC,
          new InMemoryTransactionManager(),
          new InMemoryEventBus(),
        ),
        new CancelBookingAsAdminUseCase(
          staffCtxC,
          repoC,
          new InMemoryTransactionManager(),
          new InMemoryEventBus(),
        ),
        new RescheduleBookingUseCase(
          staffCtxC,
          repoC,
          new BookingSlotConflictService(new InMemoryBookingAvailabilityPort(), staffCtxC),
          new InMemoryTransactionManager(),
          new InMemoryEventBus(),
        ),
        new CompleteBookingUseCase(
          staffCtxC,
          repoC,
          new InMemoryTransactionManager(),
          new InMemoryEventBus(),
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
  });
});
