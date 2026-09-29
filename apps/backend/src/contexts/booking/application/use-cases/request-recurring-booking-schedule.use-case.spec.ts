import { InMemoryEventBus } from '../../../../test/infrastructure/in-memory-event-bus';
import { InMemoryTransactionManager } from '../../../../test/infrastructure/in-memory-transaction-manager';
import { InMemoryTenantLock } from '../../../../test/infrastructure/in-memory-tenant-lock';
import { InMemoryBookingCustomerPort } from '../../../../test/infrastructure/in-memory-booking-customer.port';
import { InMemoryBookingPlatformPort } from '../../../../test/infrastructure/in-memory-booking-platform.port';
import { InMemoryBookingStaffPort } from '../../../../test/infrastructure/in-memory-booking-staff.port';
import { InMemoryResourceOccupancyRepository } from '../../../../test/repositories/booking/in-memory-resource-occupancy.repository';
import { InMemoryResourceRepository } from '../../../../test/repositories/booking/in-memory-resource.repository';
import { InMemoryServiceRepository } from '../../../../test/repositories/booking/in-memory-service.repository';
import { InMemoryRecurringBookingScheduleRepository } from '../../../../test/repositories/booking/in-memory-recurring-booking-schedule.repository';
import { ResourceBuilder, ServiceBuilder } from '../../../../test/builders/booking/index';
import { futureDate, nextWeekday } from '../../../../test/utils/date-helpers';
import { AvailabilityService } from '../../domain/services/availability.service';
import { ResourceRequirement } from '../../domain/resource-requirement';
import { ResourceType } from '../../domain/resource.types';
import { RecurringBookingSchedule } from '../../domain/recurring-booking-schedule.aggregate';
import {
  RecurringBookingScheduleCapReachedError,
  RecurringBookingScheduleConflictError,
  RecurringBookingScheduleIneligibleServiceError,
} from '../../domain/errors/recurring-booking-schedule.error';
import { BookingServiceNotInTenantError } from '../../domain/errors/booking-domain.error';
import { RequestRecurringBookingScheduleUseCase } from './request-recurring-booking-schedule.use-case';

const TENANT = '10000000-0000-4000-8000-000000000300';
const CUSTOMER_ID = '20000000-0000-4000-8000-000000000002';
const STAFF_ID = '30000000-0000-4000-8000-000000000003';
const CORRELATION_ID = 'corr-recurring-test';
const TIMEZONE = 'America/Sao_Paulo';

// Every fixture recurs every Tuesday, starting on the next real Tuesday from "today" — never a
// hardcoded calendar date (docs/ENGINEERING_RULES_TESTING.md § Shared test-builder date defaults).
const STARTS_ON = nextWeekday(2);

describe('RequestRecurringBookingScheduleUseCase', () => {
  let serviceRepo: InMemoryServiceRepository;
  let resourceRepo: InMemoryResourceRepository;
  let occupancyRepo: InMemoryResourceOccupancyRepository;
  let scheduleRepo: InMemoryRecurringBookingScheduleRepository;
  let customerPort: InMemoryBookingCustomerPort;
  let staffPort: InMemoryBookingStaffPort;
  let platformPort: InMemoryBookingPlatformPort;
  let eventBus: InMemoryEventBus;
  let useCase: RequestRecurringBookingScheduleUseCase;
  let resourceId: string;

  async function seedService(
    overrides: {
      recurrenceEligible?: boolean;
      bookingModel?: 'APPOINTMENT' | 'SESSION';
      resourceRequirements?: ResourceRequirement[];
      defaultApprovalMode?: 'AUTO_CONFIRM' | 'MANUAL_APPROVAL';
    } = {},
  ): Promise<string> {
    const service = new ServiceBuilder()
      .withTenantId(TENANT)
      .withName('Sala Aurora')
      .withBookingModel(overrides.bookingModel ?? 'APPOINTMENT')
      .withResourceRequirements(
        overrides.resourceRequirements ?? [
          ResourceRequirement.create({ type: ResourceType.ROOM, selectionMode: 'CUSTOMER_CHOICE' }),
        ],
      )
      .withBookingPolicy({
        recurrenceEligible: overrides.recurrenceEligible ?? true,
        defaultApprovalMode: overrides.defaultApprovalMode ?? 'AUTO_CONFIRM',
      })
      .build();
    await serviceRepo.save(service);
    return service.id;
  }

  beforeEach(async () => {
    serviceRepo = new InMemoryServiceRepository();
    resourceRepo = new InMemoryResourceRepository();
    occupancyRepo = new InMemoryResourceOccupancyRepository();
    customerPort = new InMemoryBookingCustomerPort();
    staffPort = new InMemoryBookingStaffPort();
    platformPort = new InMemoryBookingPlatformPort();
    eventBus = new InMemoryEventBus();
    scheduleRepo = new InMemoryRecurringBookingScheduleRepository(eventBus);

    const resource = new ResourceBuilder().withTenantId(TENANT).withType(ResourceType.ROOM).build();
    await resourceRepo.save(resource);
    resourceId = resource.id;

    customerPort.setProfile(CUSTOMER_ID, {
      email: 'ana@example.com',
      name: 'Ana Souza',
      phone: '+5531999999999',
      defaultAddress: null,
    });
    staffPort.setProfile(STAFF_ID, { id: STAFF_ID, isActive: true });

    useCase = new RequestRecurringBookingScheduleUseCase(
      serviceRepo,
      scheduleRepo,
      resourceRepo,
      occupancyRepo,
      customerPort,
      staffPort,
      platformPort,
      new InMemoryTenantLock(),
      new InMemoryTransactionManager(),
      new AvailabilityService(),
    );
  });

  it('creates an ACTIVE schedule for an AUTO_CONFIRM service (FIXED_ASSIGNMENT)', async () => {
    const serviceId = await seedService();

    const result = await useCase.execute({
      tenantId: TENANT,
      correlationId: CORRELATION_ID,
      timezone: TIMEZONE,
      serviceId,
      recurrence: {
        frequency: 'WEEKLY',
        daysOfWeek: ['tuesday'],
        startTime: '10:00',
        durationMinutes: 120,
      },
      startsOn: STARTS_ON,
      endsOn: null,
      assignmentPolicy: 'FIXED_ASSIGNMENT',
      resourceIds: [resourceId],
      actorType: 'CUSTOMER',
      actorId: CUSTOMER_ID,
    });

    expect(result.status).toBe('ACTIVE');
    expect(result.approvalHoldExpiresAt).toBeNull();
    const saved = await scheduleRepo.findById(result.id, TENANT);
    expect(saved?.resourceAssignments).toHaveLength(1);
    expect(eventBus.published).toHaveLength(1);
    expect(eventBus.published[0].eventName).toBe('RecurringBookingScheduleCreated');
  });

  it('creates a PENDING_APPROVAL schedule for a MANUAL_APPROVAL service', async () => {
    const serviceId = await seedService({ defaultApprovalMode: 'MANUAL_APPROVAL' });

    const result = await useCase.execute({
      tenantId: TENANT,
      correlationId: CORRELATION_ID,
      timezone: TIMEZONE,
      serviceId,
      recurrence: {
        frequency: 'WEEKLY',
        daysOfWeek: ['tuesday'],
        startTime: '10:00',
        durationMinutes: 120,
      },
      startsOn: STARTS_ON,
      endsOn: null,
      assignmentPolicy: 'FIXED_ASSIGNMENT',
      resourceIds: [resourceId],
      actorType: 'CUSTOMER',
      actorId: CUSTOMER_ID,
    });

    expect(result.status).toBe('PENDING_APPROVAL');
    expect(result.approvalHoldExpiresAt).not.toBeNull();
    expect(eventBus.published[0].eventName).toBe('RecurringBookingScheduleApprovalRequested');
  });

  it('allows staff to create a schedule on the customer’s behalf', async () => {
    const serviceId = await seedService();

    const result = await useCase.execute({
      tenantId: TENANT,
      correlationId: CORRELATION_ID,
      timezone: TIMEZONE,
      serviceId,
      recurrence: {
        frequency: 'WEEKLY',
        daysOfWeek: ['tuesday'],
        startTime: '10:00',
        durationMinutes: 120,
      },
      startsOn: STARTS_ON,
      endsOn: null,
      assignmentPolicy: 'FIXED_ASSIGNMENT',
      resourceIds: [resourceId],
      actorType: 'STAFF',
      actorId: STAFF_ID,
      bodyCustomerId: CUSTOMER_ID,
    });

    const saved = await scheduleRepo.findById(result.id, TENANT);
    expect(saved?.customerId).toBe(CUSTOMER_ID);
    expect(saved?.createdByStaffId).toBe(STAFF_ID);
  });

  it('rejects a future pattern conflict before either status branch commits', async () => {
    const serviceId = await seedService();
    const conflictStart = new Date(`${STARTS_ON}T13:00:00.000Z`); // 10:00 local (UTC-3)
    occupancyRepo.seed(TENANT, 'other-line', {
      resourceId,
      resourceType: ResourceType.ROOM,
      resourceName: 'Sala Aurora',
      legIndex: null,
      quantityPosition: null,
      selectionMode: 'CUSTOMER_CHOICE',
      isBundleMember: false,
      startsAt: conflictStart,
      endsAt: new Date(conflictStart.getTime() + 60 * 60_000),
    });

    await expect(
      useCase.execute({
        tenantId: TENANT,
        correlationId: CORRELATION_ID,
        timezone: TIMEZONE,
        serviceId,
        recurrence: {
          frequency: 'WEEKLY',
          daysOfWeek: ['tuesday'],
          startTime: '10:00',
          durationMinutes: 120,
        },
        startsOn: STARTS_ON,
        endsOn: null,
        assignmentPolicy: 'FIXED_ASSIGNMENT',
        resourceIds: [resourceId],
        actorType: 'CUSTOMER',
        actorId: CUSTOMER_ID,
      }),
    ).rejects.toThrow(RecurringBookingScheduleConflictError);

    expect(await scheduleRepo.findAllByTenant(TENANT, {})).toHaveLength(0);
  });

  it('rejects past the 50-per-resource FIXED_ASSIGNMENT cap', async () => {
    const serviceId = await seedService();
    for (let i = 0; i < 50; i++) {
      scheduleRepo.seed(
        RecurringBookingSchedule.request({
          tenantId: TENANT,
          customerId: CUSTOMER_ID,
          serviceId,
          recurrence: {
            frequency: 'WEEKLY',
            daysOfWeek: ['monday'],
            startTime: '08:00',
            durationMinutes: 60,
          },
          startsOn: futureDate(200 + i),
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
          correlationId: CORRELATION_ID,
        }),
      );
    }

    await expect(
      useCase.execute({
        tenantId: TENANT,
        correlationId: CORRELATION_ID,
        timezone: TIMEZONE,
        serviceId,
        recurrence: {
          frequency: 'WEEKLY',
          daysOfWeek: ['tuesday'],
          startTime: '10:00',
          durationMinutes: 120,
        },
        startsOn: STARTS_ON,
        endsOn: null,
        assignmentPolicy: 'FIXED_ASSIGNMENT',
        resourceIds: [resourceId],
        actorType: 'CUSTOMER',
        actorId: CUSTOMER_ID,
      }),
    ).rejects.toThrow(RecurringBookingScheduleCapReachedError);
  });

  it('rejects a service that does not have recurrence enabled', async () => {
    const serviceId = await seedService({ recurrenceEligible: false });

    await expect(
      useCase.execute({
        tenantId: TENANT,
        correlationId: CORRELATION_ID,
        timezone: TIMEZONE,
        serviceId,
        recurrence: {
          frequency: 'WEEKLY',
          daysOfWeek: ['tuesday'],
          startTime: '10:00',
          durationMinutes: 120,
        },
        startsOn: STARTS_ON,
        endsOn: null,
        assignmentPolicy: 'FIXED_ASSIGNMENT',
        resourceIds: [resourceId],
        actorType: 'CUSTOMER',
        actorId: CUSTOMER_ID,
      }),
    ).rejects.toThrow(RecurringBookingScheduleIneligibleServiceError);
  });

  it('rejects a bundle (2+ resourceRequirements) service', async () => {
    const serviceId = await seedService({
      resourceRequirements: [
        ResourceRequirement.create({ type: ResourceType.ROOM, selectionMode: 'CUSTOMER_CHOICE' }),
        ResourceRequirement.create({ type: ResourceType.EQUIPMENT, selectionMode: 'AUTO_ANY' }),
      ],
    });

    await expect(
      useCase.execute({
        tenantId: TENANT,
        correlationId: CORRELATION_ID,
        timezone: TIMEZONE,
        serviceId,
        recurrence: {
          frequency: 'WEEKLY',
          daysOfWeek: ['tuesday'],
          startTime: '10:00',
          durationMinutes: 120,
        },
        startsOn: STARTS_ON,
        endsOn: null,
        assignmentPolicy: 'FIXED_ASSIGNMENT',
        resourceIds: [resourceId],
        actorType: 'CUSTOMER',
        actorId: CUSTOMER_ID,
      }),
    ).rejects.toThrow(RecurringBookingScheduleIneligibleServiceError);
  });

  it('creates zero resource assignments for RESOLVE_PER_OCCURRENCE', async () => {
    const serviceId = await seedService({
      resourceRequirements: [
        ResourceRequirement.create({ type: ResourceType.ROOM, selectionMode: 'AUTO_ANY' }),
      ],
    });

    const result = await useCase.execute({
      tenantId: TENANT,
      correlationId: CORRELATION_ID,
      timezone: TIMEZONE,
      serviceId,
      recurrence: {
        frequency: 'WEEKLY',
        daysOfWeek: ['tuesday'],
        startTime: '10:00',
        durationMinutes: 120,
      },
      startsOn: STARTS_ON,
      endsOn: null,
      assignmentPolicy: 'RESOLVE_PER_OCCURRENCE',
      resourceIds: [],
      actorType: 'CUSTOMER',
      actorId: CUSTOMER_ID,
    });

    const saved = await scheduleRepo.findById(result.id, TENANT);
    expect(saved?.resourceAssignments).toEqual([]);
  });

  it('rejects a serviceId that belongs to a different tenant', async () => {
    const otherTenantServiceId = await seedService();
    // seedService() always writes under TENANT — reuse the id but call execute() with a
    // different tenantId to simulate a cross-tenant lookup miss.
    await expect(
      useCase.execute({
        tenantId: '10000000-0000-4000-8000-000000000999',
        correlationId: CORRELATION_ID,
        timezone: TIMEZONE,
        serviceId: otherTenantServiceId,
        recurrence: {
          frequency: 'WEEKLY',
          daysOfWeek: ['tuesday'],
          startTime: '10:00',
          durationMinutes: 120,
        },
        startsOn: STARTS_ON,
        endsOn: null,
        assignmentPolicy: 'FIXED_ASSIGNMENT',
        resourceIds: [resourceId],
        actorType: 'CUSTOMER',
        actorId: CUSTOMER_ID,
      }),
    ).rejects.toThrow(BookingServiceNotInTenantError);
  });

  it('rejects a FIXED_ASSIGNMENT request overlapping another active schedule on the same resource', async () => {
    const serviceId = await seedService();
    scheduleRepo.seed(
      RecurringBookingSchedule.request({
        tenantId: TENANT,
        customerId: 'other-customer',
        serviceId,
        recurrence: {
          frequency: 'WEEKLY',
          daysOfWeek: ['tuesday'],
          startTime: '10:00',
          durationMinutes: 120,
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
        correlationId: CORRELATION_ID,
      }),
    );

    // No resource_occupancy exists for the seeded schedule above (it has zero materialized
    // occurrences, same as any ACTIVE schedule pre-M23-S05) — only the direct schedule-to-schedule
    // comparison can catch this overlap.
    await expect(
      useCase.execute({
        tenantId: TENANT,
        correlationId: CORRELATION_ID,
        timezone: TIMEZONE,
        serviceId,
        recurrence: {
          frequency: 'WEEKLY',
          daysOfWeek: ['tuesday'],
          startTime: '10:30',
          durationMinutes: 60,
        },
        startsOn: STARTS_ON,
        endsOn: null,
        assignmentPolicy: 'FIXED_ASSIGNMENT',
        resourceIds: [resourceId],
        actorType: 'CUSTOMER',
        actorId: CUSTOMER_ID,
      }),
    ).rejects.toThrow(RecurringBookingScheduleConflictError);
  });

  it('allows a FIXED_ASSIGNMENT request on the same resource when the time windows do not overlap', async () => {
    const serviceId = await seedService();
    scheduleRepo.seed(
      RecurringBookingSchedule.request({
        tenantId: TENANT,
        customerId: 'other-customer',
        serviceId,
        recurrence: {
          frequency: 'WEEKLY',
          daysOfWeek: ['tuesday'],
          startTime: '08:00',
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
        correlationId: CORRELATION_ID,
      }),
    );

    const result = await useCase.execute({
      tenantId: TENANT,
      correlationId: CORRELATION_ID,
      timezone: TIMEZONE,
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
      resourceIds: [resourceId],
      actorType: 'CUSTOMER',
      actorId: CUSTOMER_ID,
    });

    expect(result.status).toBe('ACTIVE');
  });
});
