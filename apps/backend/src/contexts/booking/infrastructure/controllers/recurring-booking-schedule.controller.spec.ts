import { HttpException } from '@nestjs/common';
import { InMemoryEventBus } from '../../../../test/infrastructure/in-memory-event-bus';
import { InMemoryTransactionManager } from '../../../../test/infrastructure/in-memory-transaction-manager';
import { InMemoryTenantLock } from '../../../../test/infrastructure/in-memory-tenant-lock';
import { InMemoryBookingCustomerPort } from '../../../../test/infrastructure/in-memory-booking-customer.port';
import { InMemoryBookingStaffPort } from '../../../../test/infrastructure/in-memory-booking-staff.port';
import { InMemoryBookingPlatformPort } from '../../../../test/infrastructure/in-memory-booking-platform.port';
import { InMemoryResourceOccupancyRepository } from '../../../../test/repositories/booking/in-memory-resource-occupancy.repository';
import { InMemoryResourceRepository } from '../../../../test/repositories/booking/in-memory-resource.repository';
import { InMemoryScheduleClosureRepository } from '../../../../test/repositories/booking/in-memory-schedule-closure.repository';
import { InMemoryScheduleOpeningRepository } from '../../../../test/repositories/booking/in-memory-schedule-opening.repository';
import { InMemoryServiceRepository } from '../../../../test/repositories/booking/in-memory-service.repository';
import { InMemoryRecurringBookingScheduleRepository } from '../../../../test/repositories/booking/in-memory-recurring-booking-schedule.repository';
import { InMemoryBookingRepository } from '../../../../test/repositories/booking/in-memory-booking.repository';
import { ResourceBuilder, ServiceBuilder } from '../../../../test/builders/booking/index';
import { RequestContextBuilder } from '../../../../test/factories/request-context.factory';
import { addDaysUTC } from '../../../../shared/utils/calendar-date';
import { nextWeekday } from '../../../../test/utils/date-helpers';
import { AvailabilityService } from '../../domain/services/availability.service';
import { ResourceRequirement } from '../../domain/resource-requirement';
import { ResourceType } from '../../domain/resource.types';
import { RecurringBookingSchedule } from '../../domain/recurring-booking-schedule.aggregate';
import { RequestRecurringBookingScheduleUseCase } from '../../application/use-cases/request-recurring-booking-schedule.use-case';
import { ListRecurringBookingSchedulesUseCase } from '../../application/use-cases/list-recurring-booking-schedules.use-case';
import { GetRecurringBookingScheduleUseCase } from '../../application/use-cases/get-recurring-booking-schedule.use-case';
import { EndRecurringBookingScheduleUseCase } from '../../application/use-cases/end-recurring-booking-schedule.use-case';
import { ApproveRecurringBookingScheduleUseCase } from '../../application/use-cases/approve-recurring-booking-schedule.use-case';
import { RejectRecurringBookingScheduleUseCase } from '../../application/use-cases/reject-recurring-booking-schedule.use-case';
import { RecurringBookingScheduleController } from './recurring-booking-schedule.controller';

const TENANT_ID = '00000000-0000-7000-8000-000000000001';
const CUSTOMER_ID = '00000000-0000-7000-8000-000000000002';
const STARTS_ON = nextWeekday(2);
const ENDS_ON = addDaysUTC(STARTS_ON, 28);

describe('RecurringBookingScheduleController', () => {
  let scheduleRepo: InMemoryRecurringBookingScheduleRepository;
  let serviceRepo: InMemoryServiceRepository;
  let resourceRepo: InMemoryResourceRepository;
  let customerPort: InMemoryBookingCustomerPort;
  let bookingRepo: InMemoryBookingRepository;
  let controller: RecurringBookingScheduleController;
  let pendingServiceId: string;
  let resourceId: string;
  let serviceId: string;

  beforeEach(async () => {
    const eventBus = new InMemoryEventBus();
    scheduleRepo = new InMemoryRecurringBookingScheduleRepository(eventBus);
    serviceRepo = new InMemoryServiceRepository();
    resourceRepo = new InMemoryResourceRepository();
    const occupancyRepo = new InMemoryResourceOccupancyRepository();
    customerPort = new InMemoryBookingCustomerPort();
    const staffPort = new InMemoryBookingStaffPort();
    const platformPort = new InMemoryBookingPlatformPort();
    bookingRepo = new InMemoryBookingRepository(eventBus);
    const tx = new InMemoryTransactionManager();
    const tenantLock = new InMemoryTenantLock();

    const resource = new ResourceBuilder()
      .withTenantId(TENANT_ID)
      .withType(ResourceType.ROOM)
      .build();
    await resourceRepo.save(resource);
    resourceId = resource.id;

    const service = new ServiceBuilder()
      .withTenantId(TENANT_ID)
      .withResourceRequirements([
        ResourceRequirement.create({ type: ResourceType.ROOM, selectionMode: 'CUSTOMER_CHOICE' }),
      ])
      .withBookingPolicy({ recurrenceEligible: true, defaultApprovalMode: 'AUTO_CONFIRM' })
      .build();
    await serviceRepo.save(service);
    serviceId = service.id;

    const manualService = new ServiceBuilder()
      .withTenantId(TENANT_ID)
      .withResourceRequirements([
        ResourceRequirement.create({ type: ResourceType.ROOM, selectionMode: 'CUSTOMER_CHOICE' }),
      ])
      .withBookingPolicy({ recurrenceEligible: true, defaultApprovalMode: 'MANUAL_APPROVAL' })
      .build();
    await serviceRepo.save(manualService);
    pendingServiceId = manualService.id;

    customerPort.setProfile(CUSTOMER_ID, {
      email: 'ana@example.com',
      name: 'Ana Souza',
      phone: '+5531999999999',
      defaultAddress: null,
    });

    const ctx = new RequestContextBuilder()
      .withTenantId(TENANT_ID)
      .withActorId(CUSTOMER_ID)
      .withActorType('CUSTOMER')
      .withActorRole('CUSTOMER')
      .build();

    controller = new RecurringBookingScheduleController(
      ctx,
      new RequestRecurringBookingScheduleUseCase(
        serviceRepo,
        scheduleRepo,
        resourceRepo,
        bookingRepo,
        occupancyRepo,
        new InMemoryScheduleClosureRepository(),
        new InMemoryScheduleOpeningRepository(),
        customerPort,
        staffPort,
        platformPort,
        tenantLock,
        tx,
        new AvailabilityService(),
      ),
      new ListRecurringBookingSchedulesUseCase(scheduleRepo, serviceRepo),
      new GetRecurringBookingScheduleUseCase(scheduleRepo, serviceRepo),
      new EndRecurringBookingScheduleUseCase(scheduleRepo, bookingRepo, occupancyRepo, tx),
      new ApproveRecurringBookingScheduleUseCase(
        scheduleRepo,
        serviceRepo,
        bookingRepo,
        customerPort,
        resourceRepo,
        occupancyRepo,
        new InMemoryScheduleClosureRepository(),
        new InMemoryScheduleOpeningRepository(),
        platformPort,
        tenantLock,
        tx,
        new AvailabilityService(),
      ),
      new RejectRecurringBookingScheduleUseCase(scheduleRepo, tx),
    );
  });

  describe('request()', () => {
    it('creates an ACTIVE schedule for an AUTO_CONFIRM service', async () => {
      const result = await controller.request({
        serviceId,
        recurrence: {
          frequency: 'WEEKLY',
          daysOfWeek: ['tuesday'],
          startTime: '10:00',
          durationMinutes: 60,
        },
        assignmentPolicy: 'FIXED_ASSIGNMENT',
        resourceIds: [resourceId],
        startsOn: STARTS_ON,
        endsOn: ENDS_ON,
      });

      expect(result.status).toBe('ACTIVE');
    });

    it('maps BookingServiceNotInTenantError to 400 for an unknown service', async () => {
      const err = await controller
        .request({
          serviceId: '00000000-0000-7000-8000-000000000099',
          recurrence: {
            frequency: 'WEEKLY',
            daysOfWeek: ['tuesday'],
            startTime: '10:00',
            durationMinutes: 60,
          },
          assignmentPolicy: 'FIXED_ASSIGNMENT',
          resourceIds: [resourceId],
          startsOn: STARTS_ON,
          endsOn: ENDS_ON,
        })
        .catch((e: unknown) => e);

      expect(err).toBeInstanceOf(HttpException);
      expect((err as HttpException).getStatus()).toBe(400);
    });
  });

  describe('list()', () => {
    it("returns only the caller's own schedules for a CUSTOMER actor", async () => {
      const own = RecurringBookingSchedule.request({
        tenantId: TENANT_ID,
        customerId: CUSTOMER_ID,
        serviceId,
        recurrence: {
          frequency: 'WEEKLY',
          daysOfWeek: ['tuesday'],
          startTime: '10:00',
          durationMinutes: 60,
        },
        startsOn: STARTS_ON,
        endsOn: ENDS_ON,
        maxTermDays: 90,
        assignmentPolicy: 'FIXED_ASSIGNMENT',
        resourceAssignments: [
          {
            resourceId,
            resourceType: ResourceType.ROOM,
            requirementId: null,
            requiredQuantityPosition: null,
          },
        ],
        status: 'ACTIVE',
        approvalHoldExpiresAt: null,
        createdByStaffId: null,
        correlationId: 'corr-1',
      });
      const other = RecurringBookingSchedule.request({
        tenantId: TENANT_ID,
        customerId: '00000000-0000-7000-8000-000000000077',
        serviceId,
        recurrence: {
          frequency: 'WEEKLY',
          daysOfWeek: ['tuesday'],
          startTime: '10:00',
          durationMinutes: 60,
        },
        startsOn: STARTS_ON,
        endsOn: ENDS_ON,
        maxTermDays: 90,
        assignmentPolicy: 'FIXED_ASSIGNMENT',
        resourceAssignments: [
          {
            resourceId,
            resourceType: ResourceType.ROOM,
            requirementId: null,
            requiredQuantityPosition: null,
          },
        ],
        status: 'ACTIVE',
        approvalHoldExpiresAt: null,
        createdByStaffId: null,
        correlationId: 'corr-1',
      });
      scheduleRepo.seed(own);
      scheduleRepo.seed(other);

      const result = await controller.list({ limit: 25, offset: 0 });

      expect(result.items).toHaveLength(1);
      expect(result.items[0].customerId).toBe(CUSTOMER_ID);
    });
  });

  describe('get()', () => {
    const body = (): Parameters<RecurringBookingScheduleController['request']>[0] => ({
      serviceId,
      recurrence: {
        frequency: 'WEEKLY',
        daysOfWeek: ['tuesday'],
        startTime: '10:00',
        durationMinutes: 60,
      },
      assignmentPolicy: 'FIXED_ASSIGNMENT',
      resourceIds: [resourceId],
      startsOn: STARTS_ON,
      endsOn: ENDS_ON,
    });

    it("returns the caller's own schedule with the service name", async () => {
      const created = await controller.request(body());

      const result = await controller.get(created.id);

      expect(result).toMatchObject({ id: created.id, customerId: CUSTOMER_ID, status: 'ACTIVE' });
      expect(result.serviceName).toEqual(expect.any(String));
    });

    it('answers 404 (never 403) for another customer’s schedule', async () => {
      const created = await controller.request(body());
      const otherCtx = new RequestContextBuilder()
        .withTenantId(TENANT_ID)
        .withActorId('00000000-0000-7000-8000-000000000077')
        .withActorType('CUSTOMER')
        .withActorRole('CUSTOMER')
        .build();
      const otherController = new RecurringBookingScheduleController(
        otherCtx,
        undefined as never,
        undefined as never,
        new GetRecurringBookingScheduleUseCase(scheduleRepo, serviceRepo),
        undefined as never,
        undefined as never,
        undefined as never,
      );

      const err = await otherController.get(created.id).catch((e: unknown) => e);

      expect(err).toBeInstanceOf(HttpException);
      expect((err as HttpException).getStatus()).toBe(404);
    });

    it('answers 404 for an unknown schedule', async () => {
      const err = await controller
        .get('00000000-0000-7000-8000-000000000099')
        .catch((e: unknown) => e);

      expect(err).toBeInstanceOf(HttpException);
      expect((err as HttpException).getStatus()).toBe(404);
    });
  });

  describe('end()', () => {
    it('ends an ACTIVE schedule', async () => {
      const created = await controller.request({
        serviceId,
        recurrence: {
          frequency: 'WEEKLY',
          daysOfWeek: ['tuesday'],
          startTime: '10:00',
          durationMinutes: 60,
        },
        assignmentPolicy: 'FIXED_ASSIGNMENT',
        resourceIds: [resourceId],
        startsOn: STARTS_ON,
        endsOn: ENDS_ON,
      });

      const ended = await controller.end(created.id);
      expect(ended.status).toBe('CANCELLED');
    });
  });

  describe('approve() and reject()', () => {
    function requestPending() {
      return controller.request({
        serviceId: pendingServiceId,
        recurrence: {
          frequency: 'WEEKLY',
          daysOfWeek: ['tuesday'],
          startTime: '10:00',
          durationMinutes: 60,
        },
        assignmentPolicy: 'FIXED_ASSIGNMENT',
        resourceIds: [resourceId],
        startsOn: STARTS_ON,
        endsOn: ENDS_ON,
      });
    }

    it('approve() activates a pending schedule and materializes its occurrences', async () => {
      const pending = await requestPending();
      expect(pending.status).toBe('PENDING_APPROVAL');
      expect(await bookingRepo.findAllByTenant(TENANT_ID)).toHaveLength(0);

      const result = await controller.approve(pending.id);

      expect(result).toEqual({ id: pending.id, status: 'ACTIVE', occurrenceCount: 5 });
      expect(await bookingRepo.findAllByTenant(TENANT_ID)).toHaveLength(5);
    });

    it('reject() cancels a pending schedule and materializes nothing', async () => {
      const pending = await requestPending();

      const result = await controller.reject(pending.id);

      expect(result).toEqual({ id: pending.id, status: 'CANCELLED' });
      expect(await bookingRepo.findAllByTenant(TENANT_ID)).toHaveLength(0);
    });

    it('maps an unknown schedule to 404', async () => {
      const err = await controller
        .approve('00000000-0000-7000-8000-000000000099')
        .catch((e: unknown) => e);
      expect(err).toBeInstanceOf(HttpException);
      expect((err as HttpException).getStatus()).toBe(404);
    });

    it('maps an already-resolved schedule to 409', async () => {
      const pending = await requestPending();
      await controller.reject(pending.id);

      const err = await controller.approve(pending.id).catch((e: unknown) => e);
      expect(err).toBeInstanceOf(HttpException);
      expect((err as HttpException).getStatus()).toBe(409);
    });
  });
});
