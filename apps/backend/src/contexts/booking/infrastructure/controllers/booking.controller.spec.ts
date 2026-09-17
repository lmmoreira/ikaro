import { HttpException, HttpStatus } from '@nestjs/common';
import { InMemoryTransactionManager } from '../../../../test/infrastructure/in-memory-transaction-manager';
import { InMemoryResourceOccupancyRepository } from '../../../../test/repositories/booking/in-memory-resource-occupancy.repository';
import { InMemoryResourceRepository } from '../../../../test/repositories/booking/in-memory-resource.repository';
import { InMemoryTenantLock } from '../../../../test/infrastructure/in-memory-tenant-lock';
import { InMemoryBookingCustomerPort } from '../../../../test/infrastructure/in-memory-booking-customer.port';
import { InMemoryStorageService } from '../../../../test/infrastructure/in-memory-storage.service';
import { InMemoryBookingRepository } from '../../../../test/repositories/booking/in-memory-booking.repository';
import { InMemoryServiceRepository } from '../../../../test/repositories/booking/in-memory-service.repository';
import {
  BookingBuilder,
  ResourceBuilder,
  ServiceBuilder,
} from '../../../../test/builders/booking/index';
import { RequestContextBuilder } from '../../../../test/factories/request-context.factory';
import { futureDate } from '../../../../test/utils/date-helpers';
import { AvailabilityService } from '../../domain/services/availability.service';
import { ResourceRequirement } from '../../domain/resource-requirement';
import { ResourceType } from '../../domain/resource.types';
import { BookingController } from './booking.controller';
import { RequestBookingUseCase } from '../../application/use-cases/request-booking.use-case';
import { RequestAuthenticatedBookingUseCase } from '../../application/use-cases/request-authenticated-booking.use-case';
import { ListBookingsUseCase } from '../../application/use-cases/list-bookings.use-case';
import { GetBookingByIdUseCase } from '../../application/use-cases/get-booking-by-id.use-case';
import { BookingSlotConflictService } from '../../application/services/booking-slot-conflict.service';
import { PhotoExistenceService } from '../../application/services/photo-existence.service';
import { BookingStatus } from '../../domain/booking.aggregate';

const TENANT_A = '10000000-0000-4000-8000-000000000110';
const CUSTOMER_ID = '20000000-0000-4000-8000-000000000110';
const STAFF_ID = '20000000-0000-4000-8000-000000000112';
const CORRELATION_ID = 'corr-booking-ctrl-test';

describe('BookingController', () => {
  let controller: BookingController;
  let customerController: BookingController;
  let serviceRepo: InMemoryServiceRepository;
  let resourceRepo: InMemoryResourceRepository;
  let occupancyRepo: InMemoryResourceOccupancyRepository;
  let bookingRepo: InMemoryBookingRepository;
  let storageService: InMemoryStorageService;
  let serviceId: string;

  beforeEach(async () => {
    serviceRepo = new InMemoryServiceRepository();
    resourceRepo = new InMemoryResourceRepository();
    occupancyRepo = new InMemoryResourceOccupancyRepository();
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
        resourceRepo,
        occupancyRepo,
        new AvailabilityService(),
        new BookingSlotConflictService(occupancyRepo, new InMemoryTenantLock()),
        new PhotoExistenceService(storageService),
        repo,
        new InMemoryTransactionManager(),
      ),
      requestAuthenticatedBooking: new RequestAuthenticatedBookingUseCase(
        customerProfilePort,
        serviceRepo,
        resourceRepo,
        occupancyRepo,
        new AvailabilityService(),
        new BookingSlotConflictService(occupancyRepo, new InMemoryTenantLock()),
        new PhotoExistenceService(storageService),
        repo,
        new InMemoryTransactionManager(),
      ),
      listBookings: new ListBookingsUseCase(repo),
      getBooking: new GetBookingByIdUseCase(repo, storageService),
    });

    const uc = makeUseCases(bookingRepo);
    controller = new BookingController(
      staffCtx,
      uc.requestBooking,
      uc.requestAuthenticatedBooking,
      uc.listBookings,
      uc.getBooking,
    );
    const ucC = makeUseCases(bookingRepo);
    customerController = new BookingController(
      customerCtx,
      ucC.requestBooking,
      ucC.requestAuthenticatedBooking,
      ucC.listBookings,
      ucC.getBooking,
    );
    const service = new ServiceBuilder().withTenantId(TENANT_A).build();
    await serviceRepo.save(service);
    serviceId = service.id;
    // M22-S03: a service with zero resourceRequirements (every fixture here by default) falls
    // back to the tenant's LOCATION resource during write-path resolution.
    await resourceRepo.save(
      new ResourceBuilder().withTenantId(TENANT_A).withType(ResourceType.LOCATION).build(),
    );
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
      const location = new ResourceBuilder().withTenantId(TENANT_A).build();
      await resourceRepo.save(location);
      const locationService = new ServiceBuilder()
        .withTenantId(TENANT_A)
        .withResourceRequirements([
          ResourceRequirement.create({
            type: location.type,
            selectionMode: 'NONE',
            resourcePoolIds: [location.id],
            requiredQuantity: 1,
          }),
        ])
        .build();
      await serviceRepo.save(locationService);
      const conflictAt = new Date(`${futureDate(1)}T10:00:00.000Z`);
      occupancyRepo.seed(TENANT_A, 'other-line-id', {
        resourceId: location.id,
        resourceType: location.type,
        resourceName: location.name,
        legIndex: null,
        quantityPosition: null,
        startsAt: conflictAt,
        endsAt: new Date(conflictAt.getTime() + 30 * 60_000),
      });
      const ctx = new RequestContextBuilder()
        .withTenantId(TENANT_A)
        .withCorrelationId(CORRELATION_ID)
        .build();
      const repoB = new InMemoryBookingRepository();
      const ctrl = new BookingController(
        ctx,
        new RequestBookingUseCase(
          serviceRepo,
          resourceRepo,
          occupancyRepo,
          new AvailabilityService(),
          new BookingSlotConflictService(occupancyRepo, new InMemoryTenantLock()),
          new PhotoExistenceService(storageService),
          repoB,
          new InMemoryTransactionManager(),
        ),
        new RequestAuthenticatedBookingUseCase(
          new InMemoryBookingCustomerPort(),
          serviceRepo,
          resourceRepo,
          occupancyRepo,
          new AvailabilityService(),
          new BookingSlotConflictService(occupancyRepo, new InMemoryTenantLock()),
          new PhotoExistenceService(storageService),
          repoB,
          new InMemoryTransactionManager(),
        ),
        new ListBookingsUseCase(repoB),
        new GetBookingByIdUseCase(repoB, storageService),
      );
      const err = await ctrl
        .create({ ...validBody(), serviceIds: [locationService.id] })
        .catch((e: unknown) => e);
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
          resourceRepo,
          occupancyRepo,
          new AvailabilityService(),
          new BookingSlotConflictService(occupancyRepo, new InMemoryTenantLock()),
          new PhotoExistenceService(storageService),
          repoC,
          new InMemoryTransactionManager(),
        ),
        new RequestAuthenticatedBookingUseCase(
          noPhonePort,
          serviceRepo,
          resourceRepo,
          occupancyRepo,
          new AvailabilityService(),
          new BookingSlotConflictService(occupancyRepo, new InMemoryTenantLock()),
          new PhotoExistenceService(storageService),
          repoC,
          new InMemoryTransactionManager(),
        ),
        new ListBookingsUseCase(repoC),
        new GetBookingByIdUseCase(repoC, storageService),
      );
      const err = await ctrl.createAuthenticated(authBody()).catch((e: unknown) => e);
      expect(err).toBeInstanceOf(HttpException);
      expect((err as HttpException).getStatus()).toBe(HttpStatus.UNPROCESSABLE_ENTITY);
      expect(err).not.toBeInstanceOf(CustomerPhoneNotSetError);
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
});
