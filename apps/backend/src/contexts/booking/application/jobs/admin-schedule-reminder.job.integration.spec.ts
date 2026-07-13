import { DataSource } from 'typeorm';
import { IEventBus } from '../../../../shared/ports/event-bus.port';
import { IOutboxPublisher } from '../../../../shared/ports/outbox-publisher.port';
import { TypeOrmTransactionManager } from '../../../../shared/infrastructure/typeorm-transaction-manager';
import { OutboxPublisher } from '../../../../shared/infrastructure/outbox/outbox-publisher';
import { OutboxRelayService } from '../../../../shared/infrastructure/outbox/outbox-relay.service';
import { TypeOrmOutboxRepository } from '../../../../shared/infrastructure/outbox/typeorm-outbox.repository';
import { OutboxEventEntity } from '../../../../shared/infrastructure/outbox/outbox-event.entity';
import { makeConfigService } from '../../../../test/infrastructure/fake-config-service';
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
  let eventBus: jest.Mocked<IEventBus>;

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
    eventBus = {
      publish: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<IEventBus>;
  });

  function makeOutboxPublisher(): IOutboxPublisher {
    const config = makeConfigService({ OUTBOX_INLINE_DISPATCH_ENABLED: false });
    const relay = new OutboxRelayService(outboxRepo, eventBus, config);
    return new OutboxPublisher(outboxRepo, relay, config);
  }

  it('two overlapping runs for the same day → exactly one outbox row, relay delivers exactly one message', async () => {
    const tenantId = uuidv7();
    const tenantPort = new InMemoryBookingPlatformPort();
    tenantPort.seed([{ id: tenantId, timezone: 'UTC' }]);

    const job = new AdminScheduleReminderJob(
      tenantPort,
      new InMemoryBookingRepository(),
      new InMemoryBookingCustomerPort(),
      makeOutboxPublisher(),
      txManager,
    );

    await job.run(NOW_IN);
    await job.run(NOW_IN);

    const rows = await ds
      .getRepository(OutboxEventEntity)
      .find({ where: { eventName: 'AdminDailyScheduleReminder', tenantId } });
    expect(rows).toHaveLength(1);

    const relay = new OutboxRelayService(outboxRepo, eventBus, makeConfigService());
    await relay.relay([rows[0].id]);

    expect(eventBus.publish).toHaveBeenCalledTimes(1);
  });
});
