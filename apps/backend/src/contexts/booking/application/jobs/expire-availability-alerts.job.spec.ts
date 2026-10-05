import { AvailabilityAlertBuilder } from '../../../../test/builders/booking/index';
import { AppLogger } from '../../../../shared/observability/app-logger';
import { InMemoryBookingPlatformPort } from '../../../../test/infrastructure/in-memory-booking-platform.port';
import { InMemoryEventBus } from '../../../../test/infrastructure/in-memory-event-bus';
import { InMemoryTransactionManager } from '../../../../test/infrastructure/in-memory-transaction-manager';
import { InMemoryAvailabilityAlertRepository } from '../../../../test/repositories/booking/in-memory-availability-alert.repository';
import { AvailabilityAlert } from '../../domain/availability-alert.aggregate';
import { BookingConcurrentModificationError } from '../../domain/errors/booking-domain.error';
import { ExpireAvailabilityAlertsJob } from './expire-availability-alerts.job';

const TENANT_A = '00000000-0000-7000-8000-00000000000a';
const TENANT_B = '00000000-0000-7000-8000-00000000000b';
const NOW = new Date('2026-10-10T12:00:00.000Z');
const at = (ms: number): Date => new Date(NOW.getTime() + ms);
const HOUR_MS = 3_600_000;

describe('ExpireAvailabilityAlertsJob', () => {
  let alertRepo: InMemoryAvailabilityAlertRepository;
  let platformPort: InMemoryBookingPlatformPort;
  let eventBus: InMemoryEventBus;
  let job: ExpireAvailabilityAlertsJob;

  const seed = (
    tenantId: string,
    expiresAt: Date,
    status: 'ACTIVE' | 'NOTIFIED' | 'CANCELLED' = 'ACTIVE',
  ): AvailabilityAlert => {
    const alert = new AvailabilityAlertBuilder()
      .withTenantId(tenantId)
      .withExpiresAt(expiresAt)
      .withStatus(status)
      .build();
    alertRepo.seed(alert);
    return alert;
  };

  const statusOf = async (alert: AvailabilityAlert) =>
    (await alertRepo.findById(alert.id, alert.tenantId))?.status;

  beforeEach(() => {
    eventBus = new InMemoryEventBus();
    alertRepo = new InMemoryAvailabilityAlertRepository(eventBus);
    platformPort = new InMemoryBookingPlatformPort();
    platformPort.seed([
      { id: TENANT_A, timezone: 'America/Sao_Paulo' },
      { id: TENANT_B, timezone: 'UTC' },
    ]);
    job = new ExpireAvailabilityAlertsJob(
      platformPort,
      alertRepo,
      new InMemoryTransactionManager(),
    );
  });

  afterEach(() => jest.restoreAllMocks());

  it('expires an ACTIVE alert past its expiresAt and publishes AvailabilityAlertExpired', async () => {
    const overdue = seed(TENANT_A, at(-HOUR_MS));

    const result = await job.run(NOW);

    expect(result).toEqual({ expired: 1 });
    expect(await statusOf(overdue)).toBe('EXPIRED');
    expect(eventBus.published.map((e) => e.eventName)).toEqual(['AvailabilityAlertExpired']);
  });

  it('expires an alert exactly at its expiresAt', async () => {
    const due = seed(TENANT_A, NOW);

    await job.run(NOW);

    expect(await statusOf(due)).toBe('EXPIRED');
  });

  it('leaves an alert that has not reached its expiresAt untouched', async () => {
    const waiting = seed(TENANT_A, at(HOUR_MS));

    const result = await job.run(NOW);

    expect(result.expired).toBe(0);
    expect(await statusOf(waiting)).toBe('ACTIVE');
    expect(eventBus.published).toHaveLength(0);
  });

  it.each(['NOTIFIED', 'CANCELLED'] as const)(
    'never touches a %s alert, even past its expiresAt',
    async (status) => {
      const settled = seed(TENANT_A, at(-HOUR_MS), status);

      const result = await job.run(NOW);

      expect(result.expired).toBe(0);
      expect(await statusOf(settled)).toBe(status);
    },
  );

  it('expires the overdue alerts of every tenant, each within its own tenant', async () => {
    const a = seed(TENANT_A, at(-HOUR_MS));
    const b = seed(TENANT_B, at(-2 * HOUR_MS));

    const result = await job.run(NOW);

    expect(result.expired).toBe(2);
    expect(await statusOf(a)).toBe('EXPIRED');
    expect(await statusOf(b)).toBe('EXPIRED');
    expect(eventBus.published.map((e) => e.tenantId).sort()).toEqual([TENANT_A, TENANT_B]);
  });

  it('keeps going when one alert fails, logs it and does not count it', async () => {
    const errorSpy = jest.spyOn(AppLogger.prototype, 'error').mockImplementation();
    const first = seed(TENANT_A, at(-2 * HOUR_MS));
    const second = seed(TENANT_A, at(-HOUR_MS));
    const realSave = alertRepo.save.bind(alertRepo);
    jest.spyOn(alertRepo, 'save').mockImplementation(async (alert) => {
      if (alert.id === first.id) throw new Error('db down');
      await realSave(alert);
    });

    const result = await job.run(NOW);

    expect(result.expired).toBe(1);
    expect(await statusOf(second)).toBe('EXPIRED');
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('Failed to expire an availability alert'),
      expect.any(String),
      { tenantId: TENANT_A, alertId: first.id },
    );
  });

  it('treats a version conflict (a cancel got there first) as not counted and not logged', async () => {
    const errorSpy = jest.spyOn(AppLogger.prototype, 'error').mockImplementation();
    seed(TENANT_A, at(-HOUR_MS));
    jest.spyOn(alertRepo, 'save').mockRejectedValue(new BookingConcurrentModificationError());

    const result = await job.run(NOW);

    expect(result.expired).toBe(0);
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('changes one alert at a time across every tenant, never holding two transactions at once', async () => {
    for (const tenantId of [TENANT_A, TENANT_B]) {
      for (const minutes of [10, 20, 30]) seed(tenantId, at(-minutes * 60_000));
    }
    let running = 0;
    let peak = 0;
    const realSave = alertRepo.save.bind(alertRepo);
    jest.spyOn(alertRepo, 'save').mockImplementation(async (alert) => {
      running++;
      peak = Math.max(peak, running);
      await new Promise((resolve) => setTimeout(resolve, 1));
      await realSave(alert);
      running--;
    });

    const result = await job.run(NOW);

    expect(result.expired).toBe(6);
    expect(peak).toBe(1);
  });

  it('uses the current time when none is passed', async () => {
    const overdue = seed(TENANT_A, new Date(Date.now() - HOUR_MS));

    await job.run();

    expect(await statusOf(overdue)).toBe('EXPIRED');
  });
});
