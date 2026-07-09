import { InMemoryEventBus } from '../../../../test/infrastructure/in-memory-event-bus';
import { InMemoryLoyaltyEntryRepository } from '../../../../test/infrastructure/in-memory-loyalty-entry.repository';
import { InMemoryLoyaltyPlatformPort } from '../../../../test/infrastructure/in-memory-loyalty-platform.port';
import { InMemoryCronRunLogRepository } from '../../../../test/infrastructure/in-memory-cron-run-log.repository';
import { LoyaltyEntryBuilder } from '../../../../test/builders/loyalty/index';
import { PointsExpiringSoon } from '../../domain/events/points-expiring-soon.event';
import { NotifyExpiringPointsJob } from './notify-expiring-points.job';

const TENANT_A = 'aaaaaaaa-0000-4000-8000-000000001601';
const TENANT_B = 'bbbbbbbb-0000-4000-8000-000000001601';
const CUSTOMER_1 = 'cccccccc-0001-4000-8000-000000001601';
const CUSTOMER_2 = 'cccccccc-0002-4000-8000-000000001601';

const soon = (daysFromNow: number): Date =>
  new Date(Date.now() + daysFromNow * 24 * 60 * 60 * 1000);

describe('NotifyExpiringPointsJob', () => {
  let job: NotifyExpiringPointsJob;
  let entryRepo: InMemoryLoyaltyEntryRepository;
  let eventBus: InMemoryEventBus;
  let settingsPort: InMemoryLoyaltyPlatformPort;
  let cronRunLogRepo: InMemoryCronRunLogRepository;

  beforeEach(() => {
    entryRepo = new InMemoryLoyaltyEntryRepository();
    eventBus = new InMemoryEventBus();
    settingsPort = new InMemoryLoyaltyPlatformPort();
    cronRunLogRepo = new InMemoryCronRunLogRepository();
    job = new NotifyExpiringPointsJob(entryRepo, eventBus, settingsPort, cronRunLogRepo);
  });

  it('returns zero when no entries are expiring soon', async () => {
    const result = await job.run();

    expect(result.customersNotified).toBe(0);
    expect(eventBus.published).toHaveLength(0);
  });

  it('publishes one PointsExpiringSoon per customer with correct aggregated payload', async () => {
    await entryRepo.save(
      new LoyaltyEntryBuilder()
        .withTenantId(TENANT_A)
        .withCustomerId(CUSTOMER_1)
        .withPoints(10)
        .withExpiresAt(soon(3))
        .build(),
    );
    await entryRepo.save(
      new LoyaltyEntryBuilder()
        .withTenantId(TENANT_A)
        .withCustomerId(CUSTOMER_1)
        .withPoints(5)
        .withExpiresAt(soon(5))
        .build(),
    );

    const result = await job.run();

    expect(result.customersNotified).toBe(1);
    const events = eventBus.published.filter((e) => e.eventName === 'PointsExpiringSoon');
    expect(events).toHaveLength(1);
    const evt = events[0] as PointsExpiringSoon;
    expect(evt.data.customerId).toBe(CUSTOMER_1);
    expect(evt.data.pointsExpiringSoon).toBe(15);
    expect(new Date(evt.data.earliestExpiresAt) <= soon(4)).toBe(true);
  });

  it('publishes one event per customer across two customers', async () => {
    await entryRepo.save(
      new LoyaltyEntryBuilder()
        .withTenantId(TENANT_A)
        .withCustomerId(CUSTOMER_1)
        .withPoints(8)
        .withExpiresAt(soon(2))
        .build(),
    );
    await entryRepo.save(
      new LoyaltyEntryBuilder()
        .withTenantId(TENANT_A)
        .withCustomerId(CUSTOMER_2)
        .withPoints(12)
        .withExpiresAt(soon(4))
        .build(),
    );

    const result = await job.run();

    expect(result.customersNotified).toBe(2);
    expect(eventBus.published.filter((e) => e.eventName === 'PointsExpiringSoon')).toHaveLength(2);
  });

  it('skips entries outside the warning window', async () => {
    await entryRepo.save(
      new LoyaltyEntryBuilder()
        .withTenantId(TENANT_A)
        .withCustomerId(CUSTOMER_1)
        .withPoints(20)
        .withExpiresAt(soon(30))
        .build(),
    );

    const result = await job.run(new Date(), 7);

    expect(result.customersNotified).toBe(0);
    expect(eventBus.published).toHaveLength(0);
  });

  it('tenant isolation: publishes separate events per tenant', async () => {
    await entryRepo.save(
      new LoyaltyEntryBuilder()
        .withTenantId(TENANT_A)
        .withCustomerId(CUSTOMER_1)
        .withPoints(10)
        .withExpiresAt(soon(3))
        .build(),
    );
    await entryRepo.save(
      new LoyaltyEntryBuilder()
        .withTenantId(TENANT_B)
        .withCustomerId(CUSTOMER_1)
        .withPoints(15)
        .withExpiresAt(soon(3))
        .build(),
    );

    const result = await job.run();

    expect(result.customersNotified).toBe(2);
    const events = eventBus.published.filter(
      (e) => e.eventName === 'PointsExpiringSoon',
    ) as PointsExpiringSoon[];
    const tenantAEvent = events.find((e) => e.tenantId === TENANT_A);
    const tenantBEvent = events.find((e) => e.tenantId === TENANT_B);
    expect(tenantAEvent?.data.pointsExpiringSoon).toBe(10);
    expect(tenantBEvent?.data.pointsExpiringSoon).toBe(15);
  });

  it('skips customer whose expiring points are below the tenant threshold', async () => {
    settingsPort.withNotificationMinPoints(50);
    await entryRepo.save(
      new LoyaltyEntryBuilder()
        .withTenantId(TENANT_A)
        .withCustomerId(CUSTOMER_1)
        .withPoints(30)
        .withExpiresAt(soon(3))
        .build(),
    );

    const result = await job.run();

    expect(result.customersNotified).toBe(0);
    expect(eventBus.published).toHaveLength(0);
  });

  it('notifies customer whose expiring points meet the threshold exactly', async () => {
    settingsPort.withNotificationMinPoints(50);
    await entryRepo.save(
      new LoyaltyEntryBuilder()
        .withTenantId(TENANT_A)
        .withCustomerId(CUSTOMER_1)
        .withPoints(50)
        .withExpiresAt(soon(3))
        .build(),
    );

    const result = await job.run();

    expect(result.customersNotified).toBe(1);
    expect(eventBus.published.filter((e) => e.eventName === 'PointsExpiringSoon')).toHaveLength(1);
  });

  it('notifies only customers above threshold, skips those below', async () => {
    settingsPort.withNotificationMinPoints(50);
    await entryRepo.save(
      new LoyaltyEntryBuilder()
        .withTenantId(TENANT_A)
        .withCustomerId(CUSTOMER_1)
        .withPoints(20)
        .withExpiresAt(soon(3))
        .build(),
    );
    await entryRepo.save(
      new LoyaltyEntryBuilder()
        .withTenantId(TENANT_A)
        .withCustomerId(CUSTOMER_2)
        .withPoints(60)
        .withExpiresAt(soon(3))
        .build(),
    );

    const result = await job.run();

    expect(result.customersNotified).toBe(1);
    const events = eventBus.published.filter(
      (e) => e.eventName === 'PointsExpiringSoon',
    ) as PointsExpiringSoon[];
    expect(events[0].data.customerId).toBe(CUSTOMER_2);
  });

  it('does not double-publish on a second run for the same tenant on the same date', async () => {
    await entryRepo.save(
      new LoyaltyEntryBuilder()
        .withTenantId(TENANT_A)
        .withCustomerId(CUSTOMER_1)
        .withPoints(10)
        .withExpiresAt(soon(3))
        .build(),
    );
    const now = new Date();

    await job.run(now);
    await job.run(now);

    const events = eventBus.published.filter((e) => e.eventName === 'PointsExpiringSoon');
    expect(events).toHaveLength(1);
  });
});
