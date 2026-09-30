import { InMemoryEventBus } from '../../../../test/infrastructure/in-memory-event-bus';
import { InMemoryBookingPlatformPort } from '../../../../test/infrastructure/in-memory-booking-platform.port';
import { InMemoryTransactionManager } from '../../../../test/infrastructure/in-memory-transaction-manager';
import { InMemoryRecurringBookingScheduleRepository } from '../../../../test/repositories/booking/in-memory-recurring-booking-schedule.repository';
import { BookingConcurrentModificationError } from '../../domain/errors/booking-domain.error';
import { RecurringBookingSchedule } from '../../domain/recurring-booking-schedule.aggregate';
import { ResourceType } from '../../domain/resource.types';
import { ExpireRecurringBookingScheduleApprovalsJob } from './expire-recurring-schedule-approvals.job';

const TENANT_A = '00000000-0000-7000-8000-00000000000a';
const TENANT_B = '00000000-0000-7000-8000-00000000000b';
// 02:30 UTC on 2026-10-10 is still 2026-10-09 in São Paulo (UTC-3) and already 2026-10-10 in UTC.
const NOW = new Date('2026-10-10T02:30:00.000Z');

describe('ExpireRecurringBookingScheduleApprovalsJob', () => {
  let scheduleRepo: InMemoryRecurringBookingScheduleRepository;
  let platformPort: InMemoryBookingPlatformPort;
  let eventBus: InMemoryEventBus;
  let job: ExpireRecurringBookingScheduleApprovalsJob;

  function seed(
    tenantId: string,
    options: { status: 'PENDING_APPROVAL' | 'ACTIVE'; holdExpiresAt?: Date; endsOn?: string },
  ): RecurringBookingSchedule {
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
      endsOn: options.endsOn ?? '2026-11-24',
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
      status: options.status,
      approvalHoldExpiresAt: options.status === 'PENDING_APPROVAL' ? options.holdExpiresAt! : null,
      createdByStaffId: null,
      correlationId: 'corr-seed',
    });
    schedule.clearDomainEvents();
    scheduleRepo.seed(schedule);
    return schedule;
  }

  const statusOf = async (schedule: RecurringBookingSchedule) =>
    (await scheduleRepo.findById(schedule.id, schedule.tenantId))?.status;

  beforeEach(() => {
    eventBus = new InMemoryEventBus();
    scheduleRepo = new InMemoryRecurringBookingScheduleRepository(eventBus);
    platformPort = new InMemoryBookingPlatformPort();
    platformPort.seed([
      { id: TENANT_A, timezone: 'America/Sao_Paulo' },
      { id: TENANT_B, timezone: 'UTC' },
    ]);
    job = new ExpireRecurringBookingScheduleApprovalsJob(
      platformPort,
      scheduleRepo,
      new InMemoryTransactionManager(),
    );
  });

  describe('approval expiry', () => {
    it('cancels a pending request past its hold with APPROVAL_EXPIRED and publishes Rejected', async () => {
      const overdue = seed(TENANT_A, {
        status: 'PENDING_APPROVAL',
        holdExpiresAt: new Date('2026-10-10T02:00:00.000Z'),
      });

      const result = await job.run(NOW);

      expect(result).toEqual({ expired: 1, ended: 0 });
      const saved = await scheduleRepo.findById(overdue.id, TENANT_A);
      expect(saved?.status).toBe('CANCELLED');
      expect(saved?.cancellationReason).toBe('APPROVAL_EXPIRED');
      expect(eventBus.published.map((e) => e.eventName)).toEqual([
        'RecurringBookingScheduleRejected',
      ]);
    });

    it('leaves a request still inside its hold untouched', async () => {
      const waiting = seed(TENANT_A, {
        status: 'PENDING_APPROVAL',
        holdExpiresAt: new Date('2026-10-10T03:00:00.000Z'),
      });

      const result = await job.run(NOW);

      expect(result.expired).toBe(0);
      expect(await statusOf(waiting)).toBe('PENDING_APPROVAL');
    });

    it('expires the overdue requests of every tenant', async () => {
      const a = seed(TENANT_A, {
        status: 'PENDING_APPROVAL',
        holdExpiresAt: new Date('2026-10-10T01:00:00.000Z'),
      });
      const b = seed(TENANT_B, {
        status: 'PENDING_APPROVAL',
        holdExpiresAt: new Date('2026-10-10T01:00:00.000Z'),
      });

      const result = await job.run(NOW);

      expect(result.expired).toBe(2);
      expect(await statusOf(a)).toBe('CANCELLED');
      expect(await statusOf(b)).toBe('CANCELLED');
    });
  });

  describe('end of term', () => {
    it('moves an ACTIVE schedule whose last day has passed to ENDED, without an event', async () => {
      const finished = seed(TENANT_A, { status: 'ACTIVE', endsOn: '2026-10-08' });

      const result = await job.run(NOW);

      expect(result).toEqual({ expired: 0, ended: 1 });
      expect(await statusOf(finished)).toBe('ENDED');
      expect(eventBus.published).toHaveLength(0);
    });

    it('leaves one ending today and one still running untouched', async () => {
      // Tenant A is still on 2026-10-09 in São Paulo.
      const endingToday = seed(TENANT_A, { status: 'ACTIVE', endsOn: '2026-10-09' });
      const running = seed(TENANT_A, { status: 'ACTIVE', endsOn: '2026-11-24' });

      const result = await job.run(NOW);

      expect(result.ended).toBe(0);
      expect(await statusOf(endingToday)).toBe('ACTIVE');
      expect(await statusOf(running)).toBe('ACTIVE');
    });

    it("evaluates today in each tenant's own timezone", async () => {
      // Same instant: already 2026-10-10 in UTC (tenant B), still 2026-10-09 in São Paulo (A).
      const a = seed(TENANT_A, { status: 'ACTIVE', endsOn: '2026-10-09' });
      const b = seed(TENANT_B, { status: 'ACTIVE', endsOn: '2026-10-09' });

      await job.run(NOW);

      expect(await statusOf(a)).toBe('ACTIVE');
      expect(await statusOf(b)).toBe('ENDED');
    });
  });

  describe('concurrency', () => {
    it('changes one schedule at a time across every tenant, never holding two transactions at once', async () => {
      for (const tenantId of [TENANT_A, TENANT_B]) {
        for (const minute of [10, 20, 30]) {
          seed(tenantId, {
            status: 'PENDING_APPROVAL',
            holdExpiresAt: new Date(Date.UTC(2026, 9, 10, 1, minute)),
          });
        }
      }
      let running = 0;
      let peak = 0;
      const realSave = scheduleRepo.save.bind(scheduleRepo);
      jest.spyOn(scheduleRepo, 'save').mockImplementation(async (schedule) => {
        running++;
        peak = Math.max(peak, running);
        await new Promise((resolve) => setTimeout(resolve, 1));
        await realSave(schedule);
        running--;
      });

      const result = await job.run(NOW);

      expect(result.expired).toBe(6);
      expect(peak).toBe(1);
    });
  });

  describe('failures', () => {
    it('keeps going when one schedule fails and does not count it', async () => {
      const first = seed(TENANT_A, {
        status: 'PENDING_APPROVAL',
        holdExpiresAt: new Date('2026-10-10T01:00:00.000Z'),
      });
      const second = seed(TENANT_A, {
        status: 'PENDING_APPROVAL',
        holdExpiresAt: new Date('2026-10-10T01:30:00.000Z'),
      });
      const realSave = scheduleRepo.save.bind(scheduleRepo);
      jest.spyOn(scheduleRepo, 'save').mockImplementation(async (schedule) => {
        if (schedule.id === first.id) throw new Error('db down');
        await realSave(schedule);
      });

      const result = await job.run(NOW);

      expect(result.expired).toBe(1);
      expect(await statusOf(second)).toBe('CANCELLED');
    });

    it('treats a lost version race as success without logging a failure', async () => {
      seed(TENANT_A, {
        status: 'PENDING_APPROVAL',
        holdExpiresAt: new Date('2026-10-10T01:00:00.000Z'),
      });
      jest.spyOn(scheduleRepo, 'save').mockRejectedValue(new BookingConcurrentModificationError());

      const result = await job.run(NOW);

      expect(result.expired).toBe(0);
    });
  });
});
