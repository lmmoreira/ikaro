import { RecurringBookingScheduleBuilder } from '../../../../test/builders/booking/index';
import { InMemoryBookingPlatformPort } from '../../../../test/infrastructure/in-memory-booking-platform.port';
import { InMemoryEventBus } from '../../../../test/infrastructure/in-memory-event-bus';
import { InMemoryTransactionManager } from '../../../../test/infrastructure/in-memory-transaction-manager';
import { InMemoryRecurringBookingScheduleRepository } from '../../../../test/repositories/booking/in-memory-recurring-booking-schedule.repository';
import { RecurringScheduleRenewalReminderJob } from './recurring-schedule-renewal-reminder.job';

const TENANT_A = '00000000-0000-7000-8000-0000000000a1';
const TENANT_B = '00000000-0000-7000-8000-0000000000b2';
const SERVICE = '00000000-0000-7000-8000-0000000000e1';

// 09:15 in São Paulo (UTC-3) on 2026-10-12 — outside the 06:00–06:29 window.
const NOW_OUT = new Date('2026-10-12T12:15:00.000Z');
// 06:15 in São Paulo on 2026-10-12.
const NOW_IN = new Date('2026-10-12T09:15:00.000Z');
const TODAY = '2026-10-12';
const IN_SEVEN_DAYS = '2026-10-19';

interface RenewalData {
  recurringScheduleId: string;
  customerId: string;
}

describe('RecurringScheduleRenewalReminderJob', () => {
  let platform: InMemoryBookingPlatformPort;
  let repo: InMemoryRecurringBookingScheduleRepository;
  let outbox: InMemoryEventBus;
  let job: RecurringScheduleRenewalReminderJob;

  const seed = (
    customerId: string,
    endsOn: string,
    options: {
      tenantId?: string;
      startsOn?: string;
      status?: 'ACTIVE' | 'ENDED' | 'PENDING_APPROVAL';
    } = {},
  ) => {
    const schedule = new RecurringBookingScheduleBuilder()
      .withTenantId(options.tenantId ?? TENANT_A)
      .withCustomerId(customerId)
      .withServiceId(SERVICE)
      .withTerm(options.startsOn ?? '2026-08-01', endsOn)
      .withStatus(options.status ?? 'ACTIVE')
      .build();
    repo.seed(schedule);
    return schedule;
  };

  const renewals = () =>
    outbox.published.filter((e) => e.eventName === 'RecurringScheduleRenewalDue');

  beforeEach(() => {
    platform = new InMemoryBookingPlatformPort();
    platform.seed([
      { id: TENANT_A, timezone: 'America/Sao_Paulo' },
      { id: TENANT_B, timezone: 'America/Sao_Paulo' },
    ]);
    platform.seedRecurringRenewalSettings(TENANT_A, {
      timezone: 'America/Sao_Paulo',
      reminderDays: 7,
    });
    platform.seedRecurringRenewalSettings(TENANT_B, {
      timezone: 'America/Sao_Paulo',
      reminderDays: 7,
    });
    repo = new InMemoryRecurringBookingScheduleRepository();
    outbox = new InMemoryEventBus();
    job = new RecurringScheduleRenewalReminderJob(
      platform,
      repo,
      outbox,
      new InMemoryTransactionManager(),
    );
  });

  it('raises one Command for an ACTIVE schedule ending exactly lead-time days from today', async () => {
    const due = seed('customer-a', IN_SEVEN_DAYS);

    await job.run(NOW_IN);

    expect(renewals()).toHaveLength(1);
    const event = renewals()[0];
    expect(event.tenantId).toBe(TENANT_A);
    expect((event.data as unknown as RenewalData).recurringScheduleId).toBe(due.id);
    expect((event.data as unknown as RenewalData).customerId).toBe('customer-a');
  });

  it('picks only the schedule ending in 7 days, not the ones ending in 6 or 8', async () => {
    seed('customer-a', '2026-10-18');
    const exact = seed('customer-b', IN_SEVEN_DAYS);
    seed('customer-c', '2026-10-20');

    await job.run(NOW_IN);

    expect(renewals().map((e) => (e.data as unknown as RenewalData).recurringScheduleId)).toEqual([
      exact.id,
    ]);
  });

  it.each(['ENDED', 'PENDING_APPROVAL'] as const)('never reminds a %s schedule', async (status) => {
    seed('customer-a', IN_SEVEN_DAYS, { status });

    await job.run(NOW_IN);

    expect(renewals()).toHaveLength(0);
  });

  it('never reminds a cancelled schedule', async () => {
    repo.seed(
      new RecurringBookingScheduleBuilder()
        .withTenantId(TENANT_A)
        .withServiceId(SERVICE)
        .withTerm('2026-08-01', IN_SEVEN_DAYS)
        .withStatus('CANCELLED')
        .build(),
    );

    await job.run(NOW_IN);

    expect(renewals()).toHaveLength(0);
  });

  it('does not remind a schedule whose whole term is no longer than the lead time', async () => {
    seed('customer-a', IN_SEVEN_DAYS, { startsOn: TODAY });

    await job.run(NOW_IN);

    expect(renewals()).toHaveLength(0);
  });

  it('does not remind a customer who already has a successor schedule', async () => {
    seed('customer-a', IN_SEVEN_DAYS);
    seed('customer-a', '2027-01-15', { startsOn: IN_SEVEN_DAYS });

    await job.run(NOW_IN);

    expect(renewals()).toHaveLength(0);
  });

  it('does nothing outside the tenant-local 06:00–06:29 window', async () => {
    seed('customer-a', IN_SEVEN_DAYS);

    await job.run(NOW_OUT);

    expect(renewals()).toHaveLength(0);
  });

  it('does nothing for a tenant that turned the reminder off (0)', async () => {
    platform.seedRecurringRenewalSettings(TENANT_A, {
      timezone: 'America/Sao_Paulo',
      reminderDays: 0,
    });
    seed('customer-a', TODAY);

    await job.run(NOW_IN);

    expect(renewals()).toHaveLength(0);
  });

  it("uses each tenant's own lead time and never mixes tenants (tenant isolation)", async () => {
    platform.seedRecurringRenewalSettings(TENANT_B, {
      timezone: 'America/Sao_Paulo',
      reminderDays: 3,
    });
    const forA = seed('customer-a', IN_SEVEN_DAYS, { tenantId: TENANT_A });
    const forB = seed('customer-b', '2026-10-15', { tenantId: TENANT_B });
    seed('customer-c', IN_SEVEN_DAYS, { tenantId: TENANT_B });

    await job.run(NOW_IN);

    const byTenant = new Map(
      renewals().map((e) => [e.tenantId, (e.data as unknown as RenewalData).recurringScheduleId]),
    );
    expect(renewals()).toHaveLength(2);
    expect(byTenant.get(TENANT_A)).toBe(forA.id);
    expect(byTenant.get(TENANT_B)).toBe(forB.id);
  });

  it('gives a Command the dedup key of the tenant, the schedule and the local date', async () => {
    const due = seed('customer-a', IN_SEVEN_DAYS);

    await job.run(NOW_IN);

    expect((renewals()[0] as { dedupKey?: string }).dedupKey).toBe(
      `RecurringScheduleRenewalDue:${TENANT_A}:${due.id}:${TODAY}`,
    );
  });

  it('reads before the transaction opens and writes only inside it', async () => {
    seed('customer-a', IN_SEVEN_DAYS);
    const tx = new InMemoryTransactionManager();
    const run = jest.spyOn(tx, 'run');
    const findEndingOn = jest.spyOn(repo, 'findActiveEndingOn');
    job = new RecurringScheduleRenewalReminderJob(platform, repo, outbox, tx);

    await job.run(NOW_IN);

    expect(findEndingOn.mock.invocationCallOrder[0]).toBeLessThan(run.mock.invocationCallOrder[0]);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('keeps going with the other tenants when one tenant fails', async () => {
    seed('customer-b', IN_SEVEN_DAYS, { tenantId: TENANT_B });
    jest
      .spyOn(platform, 'getRecurringRenewalSettings')
      .mockRejectedValueOnce(new Error('tenant A lookup failed'));

    await expect(job.run(NOW_IN)).resolves.toBeUndefined();

    expect(renewals().map((e) => e.tenantId)).toEqual([TENANT_B]);
  });
});
