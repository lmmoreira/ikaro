import { InMemoryEventBus } from '../../../../test/infrastructure/in-memory-event-bus';
import { InMemoryTransactionManager } from '../../../../test/infrastructure/in-memory-transaction-manager';
import { InMemoryRecurringBookingScheduleRepository } from '../../../../test/repositories/booking/in-memory-recurring-booking-schedule.repository';
import { RecurringBookingSchedule } from '../../domain/recurring-booking-schedule.aggregate';
import {
  RecurringBookingScheduleForbiddenError,
  RecurringBookingScheduleNotFoundError,
} from '../../domain/errors/recurring-booking-schedule.error';
import { ResourceType } from '../../domain/resource.types';
import { PauseRecurringBookingScheduleUseCase } from './pause-recurring-booking-schedule.use-case';

const TENANT = '10000000-0000-4000-8000-000000000301';
const OTHER_TENANT = '10000000-0000-4000-8000-000000000399';
const CORRELATION_ID = 'corr-pause-test';

function activeSchedule(tenantId = TENANT): RecurringBookingSchedule {
  const schedule = RecurringBookingSchedule.request({
    tenantId,
    customerId: 'customer-1',
    serviceId: 'service-1',
    recurrence: {
      frequency: 'WEEKLY',
      daysOfWeek: ['tuesday'],
      startTime: '10:00',
      durationMinutes: 60,
    },
    startsOn: '2026-09-01',
    endsOn: null,
    assignmentPolicy: 'FIXED_ASSIGNMENT',
    resourceAssignments: [
      {
        resourceId: 'res-1',
        resourceType: ResourceType.ROOM,
        requirementId: null,
        requiredQuantityPosition: null,
      },
    ],
    status: 'ACTIVE',
    approvalHoldExpiresAt: null,
    createdByStaffId: null,
    correlationId: CORRELATION_ID,
  });
  schedule.clearDomainEvents();
  return schedule;
}

describe('PauseRecurringBookingScheduleUseCase', () => {
  let scheduleRepo: InMemoryRecurringBookingScheduleRepository;
  let eventBus: InMemoryEventBus;
  let useCase: PauseRecurringBookingScheduleUseCase;

  beforeEach(() => {
    eventBus = new InMemoryEventBus();
    scheduleRepo = new InMemoryRecurringBookingScheduleRepository(eventBus);
    useCase = new PauseRecurringBookingScheduleUseCase(
      scheduleRepo,
      new InMemoryTransactionManager(),
    );
  });

  it('pauses an ACTIVE schedule and publishes RecurringBookingSchedulePaused', async () => {
    const schedule = activeSchedule();
    scheduleRepo.seed(schedule);

    const result = await useCase.execute({
      scheduleId: schedule.id,
      tenantId: TENANT,
      correlationId: CORRELATION_ID,
      actorType: 'CUSTOMER',
      actorId: 'customer-1',
    });

    expect(result.status).toBe('PAUSED');
    const saved = await scheduleRepo.findById(schedule.id, TENANT);
    expect(saved?.status).toBe('PAUSED');
    expect(eventBus.published[0].eventName).toBe('RecurringBookingSchedulePaused');
  });

  it('throws when the schedule does not exist', async () => {
    await expect(
      useCase.execute({
        scheduleId: 'missing',
        tenantId: TENANT,
        correlationId: CORRELATION_ID,
        actorType: 'CUSTOMER',
        actorId: 'customer-1',
      }),
    ).rejects.toThrow(RecurringBookingScheduleNotFoundError);
  });

  it('throws NotFound for a schedule that belongs to a different tenant', async () => {
    const schedule = activeSchedule(OTHER_TENANT);
    scheduleRepo.seed(schedule);

    await expect(
      useCase.execute({
        scheduleId: schedule.id,
        tenantId: TENANT,
        correlationId: CORRELATION_ID,
        actorType: 'CUSTOMER',
        actorId: 'customer-1',
      }),
    ).rejects.toThrow(RecurringBookingScheduleNotFoundError);
  });

  it('rejects a CUSTOMER actor pausing a schedule that belongs to another customer', async () => {
    const schedule = activeSchedule();
    scheduleRepo.seed(schedule);

    await expect(
      useCase.execute({
        scheduleId: schedule.id,
        tenantId: TENANT,
        correlationId: CORRELATION_ID,
        actorType: 'CUSTOMER',
        actorId: 'someone-else',
      }),
    ).rejects.toThrow(RecurringBookingScheduleForbiddenError);
  });

  it('allows a STAFF actor to pause any schedule in the tenant', async () => {
    const schedule = activeSchedule();
    scheduleRepo.seed(schedule);

    const result = await useCase.execute({
      scheduleId: schedule.id,
      tenantId: TENANT,
      correlationId: CORRELATION_ID,
      actorType: 'STAFF',
      actorId: 'staff-1',
    });

    expect(result.status).toBe('PAUSED');
  });
});
