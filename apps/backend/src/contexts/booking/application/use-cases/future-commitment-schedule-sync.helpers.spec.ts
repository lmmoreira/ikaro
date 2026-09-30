import { AppLogger } from '../../../../shared/observability/app-logger';
import { InMemoryTransactionManager } from '../../../../test/infrastructure/in-memory-transaction-manager';
import { InMemoryRecurringBookingScheduleRepository } from '../../../../test/repositories/booking/in-memory-recurring-booking-schedule.repository';
import {
  FCE_TENANT_ID as TENANT_ID,
  FutureCommitmentFixture,
} from '../../../../test/utils/future-commitment-fixture';
import { Resource } from '../../domain/resource.aggregate';
import {
  RecurringBookingSchedule,
  RequestRecurringBookingScheduleOptions,
} from '../../domain/recurring-booking-schedule.aggregate';
import { ResourceType } from '../../domain/resource.types';
import { syncRecurringScheduleAssignments } from './future-commitment-schedule-sync.helpers';

describe('syncRecurringScheduleAssignments', () => {
  let world: FutureCommitmentFixture;
  let scheduleRepo: InMemoryRecurringBookingScheduleRepository;
  let logger: AppLogger;
  let source: Resource;
  let target: Resource;

  beforeEach(async () => {
    world = new FutureCommitmentFixture();
    scheduleRepo = new InMemoryRecurringBookingScheduleRepository();
    logger = new AppLogger('test');
    jest.spyOn(logger, 'warn').mockImplementation();
    source = await world.addResource('Sala 1');
    target = await world.addResource('Sala 2');
  });

  const sync = (moved: Parameters<typeof syncRecurringScheduleAssignments>[2]) =>
    syncRecurringScheduleAssignments(
      {
        txManager: new InMemoryTransactionManager(),
        scheduleRepo,
        bookingRepo: world.bookingRepo,
        occupancyRepo: world.occupancyRepo,
        logger,
      },
      TENANT_ID,
      moved,
    );

  function fixedSchedule(
    overrides: Partial<RequestRecurringBookingScheduleOptions> = {},
  ): RecurringBookingSchedule {
    const schedule = RecurringBookingSchedule.request({
      tenantId: TENANT_ID,
      customerId: 'customer-1',
      serviceId: 'service-1',
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
          resourceId: source.id,
          resourceType: ResourceType.ROOM,
          requirementId: null,
          requiredQuantityPosition: null,
        },
      ],
      status: 'ACTIVE',
      approvalHoldExpiresAt: null,
      createdByStaffId: null,
      correlationId: 'corr-sync-1',
      ...overrides,
    });
    scheduleRepo.seed(schedule);
    return schedule;
  }

  it('swaps the schedule assignment once no future occurrence is left on the old resource', async () => {
    const schedule = fixedSchedule();
    const service = await world.addService();
    await world.addBooking({ service, resource: target, recurringScheduleId: schedule.id });

    await sync([
      { recurringScheduleId: schedule.id, fromResourceId: source.id, toResourceId: target.id },
    ]);

    const stored = (await scheduleRepo.findById(schedule.id, TENANT_ID))!;
    expect(stored.resourceAssignments.map((a) => a.resourceId)).toEqual([target.id]);
  });

  it('leaves the assignment alone while a future occurrence is still on the old resource', async () => {
    const schedule = fixedSchedule();
    const service = await world.addService();
    await world.addBooking({ service, resource: target, recurringScheduleId: schedule.id });
    await world.addBooking({ service, resource: source, recurringScheduleId: schedule.id });

    await sync([
      { recurringScheduleId: schedule.id, fromResourceId: source.id, toResourceId: target.id },
    ]);

    const stored = (await scheduleRepo.findById(schedule.id, TENANT_ID))!;
    expect(stored.resourceAssignments.map((a) => a.resourceId)).toEqual([source.id]);
  });

  it('leaves the assignment alone when the moved occurrences landed on different resources', async () => {
    const schedule = fixedSchedule();
    const third = await world.addResource('Sala 3');
    const service = await world.addService();
    await world.addBooking({ service, resource: target, recurringScheduleId: schedule.id });
    await world.addBooking({ service, resource: third, recurringScheduleId: schedule.id });

    await sync([
      { recurringScheduleId: schedule.id, fromResourceId: source.id, toResourceId: target.id },
      { recurringScheduleId: schedule.id, fromResourceId: source.id, toResourceId: third.id },
    ]);

    const stored = (await scheduleRepo.findById(schedule.id, TENANT_ID))!;
    expect(stored.resourceAssignments.map((a) => a.resourceId)).toEqual([source.id]);
  });

  it('ignores a schedule that is no longer ACTIVE', async () => {
    const schedule = fixedSchedule();
    schedule.end('corr-sync-1', []);

    await sync([
      { recurringScheduleId: schedule.id, fromResourceId: source.id, toResourceId: target.id },
    ]);

    const stored = (await scheduleRepo.findById(schedule.id, TENANT_ID))!;
    expect(stored.resourceAssignments.map((a) => a.resourceId)).toEqual([source.id]);
  });

  it('ignores a RESOLVE_PER_OCCURRENCE schedule', async () => {
    const schedule = fixedSchedule({
      assignmentPolicy: 'RESOLVE_PER_OCCURRENCE',
      resourceAssignments: [],
    });

    await sync([
      { recurringScheduleId: schedule.id, fromResourceId: source.id, toResourceId: target.id },
    ]);

    const stored = (await scheduleRepo.findById(schedule.id, TENANT_ID))!;
    expect(stored.resourceAssignments).toEqual([]);
  });

  it('logs and carries on when updating a schedule fails, never failing the resolve', async () => {
    const schedule = fixedSchedule();
    jest.spyOn(scheduleRepo, 'findById').mockRejectedValue(new Error('version conflict'));

    await expect(
      sync([
        { recurringScheduleId: schedule.id, fromResourceId: source.id, toResourceId: target.id },
      ]),
    ).resolves.toBeUndefined();

    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('version conflict'),
      expect.objectContaining({ tenantId: TENANT_ID, recurringScheduleId: schedule.id }),
    );
  });
});
