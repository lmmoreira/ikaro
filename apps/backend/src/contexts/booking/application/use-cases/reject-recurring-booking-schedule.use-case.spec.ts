import { InMemoryEventBus } from '../../../../test/infrastructure/in-memory-event-bus';
import { InMemoryTransactionManager } from '../../../../test/infrastructure/in-memory-transaction-manager';
import { InMemoryRecurringBookingScheduleRepository } from '../../../../test/repositories/booking/in-memory-recurring-booking-schedule.repository';
import {
  RecurringBookingScheduleNotFoundError,
  RecurringBookingScheduleNotPendingApprovalError,
} from '../../domain/errors/recurring-booking-schedule.error';
import { RecurringBookingSchedule } from '../../domain/recurring-booking-schedule.aggregate';
import { ResourceType } from '../../domain/resource.types';
import { RejectRecurringBookingScheduleUseCase } from './reject-recurring-booking-schedule.use-case';

const TENANT = '10000000-0000-4000-8000-000000000500';
const OTHER_TENANT = '10000000-0000-4000-8000-000000000501';
const CORRELATION_ID = 'corr-reject-test';

describe('RejectRecurringBookingScheduleUseCase', () => {
  let scheduleRepo: InMemoryRecurringBookingScheduleRepository;
  let eventBus: InMemoryEventBus;
  let useCase: RejectRecurringBookingScheduleUseCase;

  function seed(status: 'PENDING_APPROVAL' | 'ACTIVE'): RecurringBookingSchedule {
    const schedule = RecurringBookingSchedule.request({
      tenantId: TENANT,
      customerId: 'customer-1',
      serviceId: 'service-1',
      recurrence: {
        frequency: 'WEEKLY',
        daysOfWeek: ['tuesday'],
        startTime: '10:00',
        durationMinutes: 60,
      },
      startsOn: '2026-10-06',
      endsOn: '2026-10-27',
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
      approvalHoldExpiresAt: status === 'PENDING_APPROVAL' ? new Date('2999-01-01') : null,
      createdByStaffId: null,
      correlationId: CORRELATION_ID,
    });
    schedule.clearDomainEvents();
    scheduleRepo.seed(schedule);
    return schedule;
  }

  beforeEach(() => {
    eventBus = new InMemoryEventBus();
    scheduleRepo = new InMemoryRecurringBookingScheduleRepository(eventBus);
    useCase = new RejectRecurringBookingScheduleUseCase(
      scheduleRepo,
      new InMemoryTransactionManager(),
    );
  });

  it('cancels a pending request with APPROVAL_REJECTED and publishes Rejected', async () => {
    const schedule = seed('PENDING_APPROVAL');

    const result = await useCase.execute({
      scheduleId: schedule.id,
      tenantId: TENANT,
      correlationId: CORRELATION_ID,
    });

    expect(result).toEqual({ id: schedule.id, status: 'CANCELLED' });
    const saved = await scheduleRepo.findById(schedule.id, TENANT);
    expect(saved?.status).toBe('CANCELLED');
    expect(saved?.cancellationReason).toBe('APPROVAL_REJECTED');
    expect(saved?.approvalHoldExpiresAt).toBeNull();
    expect(eventBus.published.map((e) => e.eventName)).toEqual([
      'RecurringBookingScheduleRejected',
    ]);
  });

  it('refuses a schedule that is not pending', async () => {
    const schedule = seed('ACTIVE');

    await expect(
      useCase.execute({ scheduleId: schedule.id, tenantId: TENANT, correlationId: CORRELATION_ID }),
    ).rejects.toThrow(RecurringBookingScheduleNotPendingApprovalError);
    expect(eventBus.published).toHaveLength(0);
  });

  it('throws not-found for an unknown schedule', async () => {
    await expect(
      useCase.execute({
        scheduleId: '00000000-0000-7000-8000-0000000000aa',
        tenantId: TENANT,
        correlationId: CORRELATION_ID,
      }),
    ).rejects.toThrow(RecurringBookingScheduleNotFoundError);
  });

  it("never reaches another tenant's schedule", async () => {
    const schedule = seed('PENDING_APPROVAL');

    await expect(
      useCase.execute({
        scheduleId: schedule.id,
        tenantId: OTHER_TENANT,
        correlationId: CORRELATION_ID,
      }),
    ).rejects.toThrow(RecurringBookingScheduleNotFoundError);
    expect((await scheduleRepo.findById(schedule.id, TENANT))?.status).toBe('PENDING_APPROVAL');
  });
});
