import { DataSource } from 'typeorm';
import { TypeOrmTransactionManager } from '../../../../shared/infrastructure/typeorm-transaction-manager';
import { InMemoryEventBus } from '../../../../test/infrastructure/in-memory-event-bus';
import { OutboxRelayService } from '../../../../shared/infrastructure/outbox/outbox-relay.service';
import { TypeOrmOutboxRepository } from '../../../../shared/infrastructure/outbox/typeorm-outbox.repository';
import { OutboxEventEntity } from '../../../../shared/infrastructure/outbox/outbox-event.entity';
import { makeConfigService } from '../../../../test/infrastructure/fake-config-service';
import { makeRealOutboxPublisher } from '../../../../test/factories/real-outbox-publisher.factory';
import { InMemoryInboxRepository } from '../../../../test/infrastructure/in-memory-inbox.repository';
import { createTestDataSource } from '../../../../test/test-datasource';
import { InMemoryLoyaltyEntryRepository } from '../../../../test/infrastructure/in-memory-loyalty-entry.repository';
import { InMemoryLoyaltyPlatformPort } from '../../../../test/infrastructure/in-memory-loyalty-platform.port';
import { LoyaltyEntryBuilder } from '../../../../test/builders/loyalty/index';
import { uuidv7 } from '../../../../shared/domain/uuid-v7';
import { NotifyExpiringPointsJob } from './notify-expiring-points.job';

// TD24-S03: same real-outbox proof as the two booking jobs, for the loyalty cron job.
describe('NotifyExpiringPointsJob (integration, TD24-S03 cron double-send fix)', () => {
  let ds: DataSource;
  let txManager: TypeOrmTransactionManager;
  let outboxRepo: TypeOrmOutboxRepository;
  let eventBus: InMemoryEventBus;

  beforeAll(async () => {
    ds = await createTestDataSource();
    txManager = new TypeOrmTransactionManager(ds);
    outboxRepo = new TypeOrmOutboxRepository(ds.getRepository(OutboxEventEntity));
  });

  afterAll(async () => {
    await ds.destroy();
  });

  beforeEach(() => {
    eventBus = new InMemoryEventBus();
  });

  it('two overlapping runs for the same day → exactly one outbox row, relay delivers exactly one message', async () => {
    const tenantId = uuidv7();
    const customerId = uuidv7();
    const entryRepo = new InMemoryLoyaltyEntryRepository();
    await entryRepo.save(
      new LoyaltyEntryBuilder()
        .withTenantId(tenantId)
        .withCustomerId(customerId)
        .withPoints(10)
        .withExpiresAt(new Date(Date.now() + 3 * 24 * 60 * 60 * 1000))
        .build(),
    );

    const job = new NotifyExpiringPointsJob(
      entryRepo,
      makeRealOutboxPublisher(outboxRepo, eventBus),
      new InMemoryLoyaltyPlatformPort(),
      txManager,
    );

    const now = new Date();
    // Genuinely concurrent — see booking-reminder.job.integration.spec.ts for why sequential
    // awaits would only prove retry dedup, not the overlapping-run race this test is named for.
    await Promise.all([job.run(now), job.run(now)]);

    const rows = await ds
      .getRepository(OutboxEventEntity)
      .find({ where: { eventName: 'PointsExpiringSoon', tenantId } });
    expect(rows).toHaveLength(1);

    // Explicit row id (bypasses the sweep's grace window, which a freshly-inserted row wouldn't
    // clear yet) — this is the same call shape OutboxPublisher's own inline dispatch uses.
    const relay = new OutboxRelayService(
      outboxRepo,
      eventBus,
      new InMemoryInboxRepository(),
      makeConfigService(),
    );
    await relay.relay([rows[0].id]);

    // Row's own DB state, not this call's local eventBus mock — see
    // booking-reminder.job.integration.spec.ts for why: the sweep scans the whole shared.outbox
    // table with no per-test scoping, and other spec files in this suite deliberately configure
    // OUTBOX_SWEEP_GRACE_SECONDS: 0 — if one of those sweeps claims and publishes this exact row
    // between insertion and this relay.relay() call, findUnpublishedById() correctly finds
    // nothing left to do and this test's own eventBus.published would be a false-negative 0,
    // even though the row genuinely got published.
    const publishedRow = await ds.getRepository(OutboxEventEntity).findOne({
      where: { id: rows[0].id },
    });
    expect(publishedRow!.publishedAt).not.toBeNull();
  });
});
