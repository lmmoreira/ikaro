import { InMemoryEventBus } from '../../../../test/infrastructure/in-memory-event-bus';
import { InMemoryRecurringBookingScheduleRepository } from '../../../../test/repositories/booking/in-memory-recurring-booking-schedule.repository';
import { RecurringBookingSchedule } from '../../domain/recurring-booking-schedule.aggregate';
import { ResourceType } from '../../domain/resource.types';
import { ListRecurringBookingSchedulesUseCase } from './list-recurring-booking-schedules.use-case';

const TENANT = '10000000-0000-4000-8000-000000000401';

function schedule(customerId: string): RecurringBookingSchedule {
  return RecurringBookingSchedule.request({
    tenantId: TENANT,
    customerId,
    serviceId: 'service-1',
    recurrence: { frequency: 'WEEKLY', daysOfWeek: ['tuesday'], startTime: '10:00', durationMinutes: 60 },
    startsOn: '2026-09-01',
    endsOn: null,
    assignmentPolicy: 'FIXED_ASSIGNMENT',
    resourceAssignments: [
      { resourceId: 'res-1', resourceType: ResourceType.ROOM, requirementId: null, requiredQuantityPosition: null },
    ],
    status: 'ACTIVE',
    approvalHoldExpiresAt: null,
    createdByStaffId: null,
    correlationId: 'corr-1',
  });
}

describe('ListRecurringBookingSchedulesUseCase', () => {
  let repo: InMemoryRecurringBookingScheduleRepository;
  let useCase: ListRecurringBookingSchedulesUseCase;

  beforeEach(() => {
    repo = new InMemoryRecurringBookingScheduleRepository(new InMemoryEventBus());
    useCase = new ListRecurringBookingSchedulesUseCase(repo);
  });

  it('returns every schedule for the tenant when customerId is omitted (STAFF|MANAGER)', async () => {
    repo.seed(schedule('customer-a'));
    repo.seed(schedule('customer-b'));

    const result = await useCase.execute({ tenantId: TENANT });

    expect(result.items).toHaveLength(2);
  });

  it("scopes to the caller's own schedules when customerId is set (CUSTOMER)", async () => {
    repo.seed(schedule('customer-a'));
    repo.seed(schedule('customer-b'));

    const result = await useCase.execute({ tenantId: TENANT, customerId: 'customer-a' });

    expect(result.items).toHaveLength(1);
    expect(result.items[0].customerId).toBe('customer-a');
  });

  it('maps each item with the expected shape', async () => {
    repo.seed(schedule('customer-a'));

    const result = await useCase.execute({ tenantId: TENANT });

    expect(result.items[0]).toMatchObject({
      customerId: 'customer-a',
      serviceId: 'service-1',
      status: 'ACTIVE',
      assignmentPolicy: 'FIXED_ASSIGNMENT',
      approvalHoldExpiresAt: null,
    });
  });
});
