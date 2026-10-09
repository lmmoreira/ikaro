import { InMemoryEventBus } from '../../../../test/infrastructure/in-memory-event-bus';
import { ServiceBuilder } from '../../../../test/builders/booking/service.builder';
import { InMemoryRecurringBookingScheduleRepository } from '../../../../test/repositories/booking/in-memory-recurring-booking-schedule.repository';
import { InMemoryServiceRepository } from '../../../../test/repositories/booking/in-memory-service.repository';
import { RecurringBookingScheduleNotFoundError } from '../../domain/errors/recurring-booking-schedule.error';
import { RecurringBookingSchedule } from '../../domain/recurring-booking-schedule.aggregate';
import { ResourceType } from '../../domain/resource.types';
import { GetRecurringBookingScheduleUseCase } from './get-recurring-booking-schedule.use-case';
import { toRecurringBookingScheduleResult } from './recurring-booking-schedule-result.helpers';

const TENANT = '10000000-0000-4000-8000-000000000401';
const OTHER_TENANT = '10000000-0000-4000-8000-000000000499';
const SERVICE_ID = 'service-1';

function schedule(
  customerId: string,
  tenantId = TENANT,
  status: 'ACTIVE' | 'PENDING_APPROVAL' = 'ACTIVE',
): RecurringBookingSchedule {
  return RecurringBookingSchedule.request({
    tenantId,
    customerId,
    serviceId: SERVICE_ID,
    recurrence: {
      frequency: 'WEEKLY',
      daysOfWeek: ['tuesday'],
      startTime: '10:00',
      durationMinutes: 60,
    },
    startsOn: '2026-09-01',
    endsOn: '2026-11-24',
    maxTermDays: 90,
    assignmentPolicy: 'FIXED_ASSIGNMENT',
    resourceAssignments: [
      {
        resourceId: 'res-1',
        resourceType: ResourceType.ROOM,
        requirementId: null,
        requiredQuantityPosition: null,
      },
    ],
    status,
    approvalHoldExpiresAt: status === 'PENDING_APPROVAL' ? new Date('2099-01-01T00:00:00Z') : null,
    createdByStaffId: null,
    correlationId: 'corr-1',
  });
}

describe('GetRecurringBookingScheduleUseCase', () => {
  let scheduleRepo: InMemoryRecurringBookingScheduleRepository;
  let serviceRepo: InMemoryServiceRepository;
  let useCase: GetRecurringBookingScheduleUseCase;

  beforeEach(async () => {
    scheduleRepo = new InMemoryRecurringBookingScheduleRepository(new InMemoryEventBus());
    serviceRepo = new InMemoryServiceRepository();
    await serviceRepo.save(
      new ServiceBuilder().withId(SERVICE_ID).withTenantId(TENANT).withName('Sala Aurora').build(),
    );
    useCase = new GetRecurringBookingScheduleUseCase(scheduleRepo, serviceRepo);
  });

  it("returns the owner's schedule in the list-item shape, with the service name", async () => {
    const own = schedule('customer-a');
    scheduleRepo.seed(own);

    const result = await useCase.execute({
      scheduleId: own.id,
      tenantId: TENANT,
      customerId: 'customer-a',
    });

    expect(result).toEqual(toRecurringBookingScheduleResult(own, 'Sala Aurora'));
    expect(result.serviceName).toBe('Sala Aurora');
  });

  it('returns any schedule of the tenant when customerId is omitted (STAFF|MANAGER)', async () => {
    const own = schedule('customer-a');
    scheduleRepo.seed(own);

    const result = await useCase.execute({ scheduleId: own.id, tenantId: TENANT });

    expect(result.id).toBe(own.id);
    expect(result.customerId).toBe('customer-a');
  });

  it('returns a pending schedule with its approval-hold expiry', async () => {
    const pending = schedule('customer-a', TENANT, 'PENDING_APPROVAL');
    scheduleRepo.seed(pending);

    const result = await useCase.execute({
      scheduleId: pending.id,
      tenantId: TENANT,
      customerId: 'customer-a',
    });

    expect(result.status).toBe('PENDING_APPROVAL');
    expect(result.approvalHoldExpiresAt).toBe('2099-01-01T00:00:00.000Z');
  });

  it("throws not-found (never a forbidden error) for another customer's schedule", async () => {
    const foreign = schedule('customer-b');
    scheduleRepo.seed(foreign);

    await expect(
      useCase.execute({ scheduleId: foreign.id, tenantId: TENANT, customerId: 'customer-a' }),
    ).rejects.toBeInstanceOf(RecurringBookingScheduleNotFoundError);
  });

  it("throws not-found for another tenant's schedule", async () => {
    const otherTenant = schedule('customer-a', OTHER_TENANT);
    scheduleRepo.seed(otherTenant);

    await expect(
      useCase.execute({ scheduleId: otherTenant.id, tenantId: TENANT }),
    ).rejects.toBeInstanceOf(RecurringBookingScheduleNotFoundError);
  });

  it('throws not-found for an unknown id', async () => {
    await expect(
      useCase.execute({ scheduleId: 'does-not-exist', tenantId: TENANT }),
    ).rejects.toBeInstanceOf(RecurringBookingScheduleNotFoundError);
  });

  it("does not resolve a service name from another tenant's service", async () => {
    const own = schedule('customer-a');
    scheduleRepo.seed(own);
    const otherTenantServices = new InMemoryServiceRepository();
    await otherTenantServices.save(
      new ServiceBuilder().withId(SERVICE_ID).withTenantId(OTHER_TENANT).withName('Outro').build(),
    );
    const isolated = new GetRecurringBookingScheduleUseCase(scheduleRepo, otherTenantServices);

    await expect(isolated.execute({ scheduleId: own.id, tenantId: TENANT })).rejects.toThrow(
      'Service service-1',
    );
  });
});
