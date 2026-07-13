import { InMemoryEventBus } from '../../../../test/infrastructure/in-memory-event-bus';
import { InMemoryTransactionManager } from '../../../../test/infrastructure/in-memory-transaction-manager';
import { InMemoryLoyaltyEntryRepository } from '../../../../test/infrastructure/in-memory-loyalty-entry.repository';
import { InMemoryLoyaltyPlatformPort } from '../../../../test/infrastructure/in-memory-loyalty-platform.port';
import { LoyaltyEntryBuilder } from '../../../../test/builders/loyalty/index';
import { PointsExpiringSoon } from '../../domain/commands/points-expiring-soon.command';
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
  let outboxPublisher: InMemoryEventBus;
  let settingsPort: InMemoryLoyaltyPlatformPort;

  beforeEach(() => {
    entryRepo = new InMemoryLoyaltyEntryRepository();
    outboxPublisher = new InMemoryEventBus();
    settingsPort = new InMemoryLoyaltyPlatformPort();
    job = new NotifyExpiringPointsJob(
      entryRepo,
      outboxPublisher,
      settingsPort,
      new InMemoryTransactionManager(),
    );
  });

  it('returns zero when no entries are expiring soon', async () => {
    const result = await job.run();

    expect(result.customersNotified).toBe(0);
    expect(outboxPublisher.published).toHaveLength(0);
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
    const events = outboxPublisher.published.filter((e) => e.eventName === 'PointsExpiringSoon');
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
    expect(
      outboxPublisher.published.filter((e) => e.eventName === 'PointsExpiringSoon'),
    ).toHaveLength(2);
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
    expect(outboxPublisher.published).toHaveLength(0);
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
    const events = outboxPublisher.published.filter(
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
    expect(outboxPublisher.published).toHaveLength(0);
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
    expect(
      outboxPublisher.published.filter((e) => e.eventName === 'PointsExpiringSoon'),
    ).toHaveLength(1);
  });

  it('sets dedupKey to PointsExpiringSoon:<tenantId>:<customerId>:<UTC run date>', async () => {
    const now = new Date('2026-06-01T06:00:00.000Z');
    await entryRepo.save(
      new LoyaltyEntryBuilder()
        .withTenantId(TENANT_A)
        .withCustomerId(CUSTOMER_1)
        .withPoints(10)
        .withExpiresAt(new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000))
        .build(),
    );

    await job.run(now);

    const event = outboxPublisher.published.find(
      (e) => e.eventName === 'PointsExpiringSoon',
    ) as PointsExpiringSoon;
    expect(event.dedupKey).toBe(`PointsExpiringSoon:${TENANT_A}:${CUSTOMER_1}:2026-06-01`);
  });

  it('two overlapping runs for the same day produce the same dedupKey (TD24-S03 cron double-send fix)', async () => {
    const now = new Date('2026-06-01T06:00:00.000Z');
    await entryRepo.save(
      new LoyaltyEntryBuilder()
        .withTenantId(TENANT_A)
        .withCustomerId(CUSTOMER_1)
        .withPoints(10)
        .withExpiresAt(new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000))
        .build(),
    );

    await job.run(now);
    await job.run(now);

    const events = outboxPublisher.published.filter(
      (e) => e.eventName === 'PointsExpiringSoon',
    ) as PointsExpiringSoon[];
    expect(events).toHaveLength(2); // InMemoryEventBus doesn't dedup — the outbox does (S01/S03)
    expect(events[0].dedupKey).toBe(events[1].dedupKey);
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
    const events = outboxPublisher.published.filter(
      (e) => e.eventName === 'PointsExpiringSoon',
    ) as PointsExpiringSoon[];
    expect(events[0].data.customerId).toBe(CUSTOMER_2);
  });
});
