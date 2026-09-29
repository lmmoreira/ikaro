import { HttpException } from '@nestjs/common';
import { InMemoryEventBus } from '../../../../test/infrastructure/in-memory-event-bus';
import { InMemoryTransactionManager } from '../../../../test/infrastructure/in-memory-transaction-manager';
import { InMemoryTenantLock } from '../../../../test/infrastructure/in-memory-tenant-lock';
import { InMemoryBookingCustomerPort } from '../../../../test/infrastructure/in-memory-booking-customer.port';
import { InMemoryBookingStaffPort } from '../../../../test/infrastructure/in-memory-booking-staff.port';
import { InMemoryBookingPlatformPort } from '../../../../test/infrastructure/in-memory-booking-platform.port';
import { InMemoryResourceOccupancyRepository } from '../../../../test/repositories/booking/in-memory-resource-occupancy.repository';
import { InMemoryResourceRepository } from '../../../../test/repositories/booking/in-memory-resource.repository';
import { InMemoryServiceRepository } from '../../../../test/repositories/booking/in-memory-service.repository';
import { InMemoryRecurringBookingScheduleRepository } from '../../../../test/repositories/booking/in-memory-recurring-booking-schedule.repository';
import { InMemoryBookingRepository } from '../../../../test/repositories/booking/in-memory-booking.repository';
import { ResourceBuilder, ServiceBuilder } from '../../../../test/builders/booking/index';
import { RequestContextBuilder } from '../../../../test/factories/request-context.factory';
import { nextWeekday } from '../../../../test/utils/date-helpers';
import { AvailabilityService } from '../../domain/services/availability.service';
import { ResourceRequirement } from '../../domain/resource-requirement';
import { ResourceType } from '../../domain/resource.types';
import { RecurringBookingSchedule } from '../../domain/recurring-booking-schedule.aggregate';
import { RequestRecurringBookingScheduleUseCase } from '../../application/use-cases/request-recurring-booking-schedule.use-case';
import { ListRecurringBookingSchedulesUseCase } from '../../application/use-cases/list-recurring-booking-schedules.use-case';
import { SkipOrRescheduleOccurrenceUseCase } from '../../application/use-cases/skip-or-reschedule-occurrence.use-case';
import { PauseRecurringBookingScheduleUseCase } from '../../application/use-cases/pause-recurring-booking-schedule.use-case';
import { EndRecurringBookingScheduleUseCase } from '../../application/use-cases/end-recurring-booking-schedule.use-case';
import { RecurringBookingScheduleController } from './recurring-booking-schedule.controller';

const TENANT_ID = '00000000-0000-7000-8000-000000000001';
const CUSTOMER_ID = '00000000-0000-7000-8000-000000000002';
const STARTS_ON = nextWeekday(2);

describe('RecurringBookingScheduleController', () => {
  let scheduleRepo: InMemoryRecurringBookingScheduleRepository;
  let serviceRepo: InMemoryServiceRepository;
  let resourceRepo: InMemoryResourceRepository;
  let customerPort: InMemoryBookingCustomerPort;
  let bookingRepo: InMemoryBookingRepository;
  let controller: RecurringBookingScheduleController;
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
        occupancyRepo,
        customerPort,
        staffPort,
        platformPort,
        tenantLock,
        tx,
        new AvailabilityService(),
      ),
      new ListRecurringBookingSchedulesUseCase(scheduleRepo),
      new SkipOrRescheduleOccurrenceUseCase(scheduleRepo, bookingRepo, occupancyRepo, tx),
      new PauseRecurringBookingScheduleUseCase(scheduleRepo, tx),
      new EndRecurringBookingScheduleUseCase(scheduleRepo, bookingRepo, occupancyRepo, tx),
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
        endsOn: null,
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
        endsOn: null,
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

  describe('pause()/end()', () => {
    it('pauses then rejects a second pause with 409', async () => {
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
      });

      const paused = await controller.pause(created.id);
      expect(paused.status).toBe('PAUSED');

      const err = await controller.pause(created.id).catch((e: unknown) => e);
      expect(err).toBeInstanceOf(HttpException);
      expect((err as HttpException).getStatus()).toBe(409);
    });

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
      });

      const ended = await controller.end(created.id);
      expect(ended.status).toBe('CANCELLED');
    });
  });

  describe('skipOrReschedule()', () => {
    it('records a SKIPPED exception on an ACTIVE schedule', async () => {
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
      });

      const occurrenceStart = `${STARTS_ON}T13:00:00.000Z`;
      const result = await controller.skipOrReschedule(created.id, occurrenceStart, {
        action: 'SKIP',
      });

      expect(result.kind).toBe('SKIPPED');
    });

    it('maps RecurringBookingScheduleNotFoundError to 404', async () => {
      const err = await controller
        .skipOrReschedule('00000000-0000-7000-8000-000000000099', `${STARTS_ON}T13:00:00.000Z`, {
          action: 'SKIP',
        })
        .catch((e: unknown) => e);

      expect(err).toBeInstanceOf(HttpException);
      expect((err as HttpException).getStatus()).toBe(404);
    });
  });
});
