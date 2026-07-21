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
import { InMemoryBookingPlatformPort } from '../../../../test/infrastructure/in-memory-booking-platform.port';
import { InMemoryBookingRepository } from '../../../../test/repositories/booking/in-memory-booking.repository';
import { InMemoryBookingCustomerPort } from '../../../../test/infrastructure/in-memory-booking-customer.port';
import { uuidv7 } from '../../../../shared/domain/uuid-v7';
import { AdminScheduleReminderJob } from './admin-schedule-reminder.job';

// TD24-S03: same real-outbox proof as booking-reminder.job.integration.spec.ts, for the second of
// the 3 cron jobs migrated in this story.
describe('AdminScheduleReminderJob (integration, TD24-S03 cron double-send fix)', () => {
  let ds: DataSource;
  let txManager: TypeOrmTransactionManager;
  let outboxRepo: TypeOrmOutboxRepository;
  let eventBus: InMemoryEventBus;

  const NOW_IN = new Date('2026-06-01T06:15:00.000Z');

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
    const tenantPort = new InMemoryBookingPlatformPort();
    tenantPort.seed([{ id: tenantId, timezone: 'UTC' }]);

    const job = new AdminScheduleReminderJob(
      tenantPort,
      new InMemoryBookingRepository(),
      new InMemoryBookingCustomerPort(),
      makeRealOutboxPublisher(outboxRepo, eventBus),
      txManager,
    );

    // Genuinely concurrent — see booking-reminder.job.integration.spec.ts for why sequential
    // awaits would only prove retry dedup, not the overlapping-run race this test is named for.
    await Promise.all([job.run(NOW_IN), job.run(NOW_IN)]);

    const rows = await ds
      .getRepository(OutboxEventEntity)
      .find({ where: { eventName: 'AdminDailyScheduleReminder', tenantId } });
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
