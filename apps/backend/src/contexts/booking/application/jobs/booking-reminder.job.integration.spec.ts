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
import { BookingBuilder, BookingLineBuilder } from '../../../../test/builders/booking/index';
import { uuidv7 } from '../../../../shared/domain/uuid-v7';
import { BookingStatus } from '../../domain/booking.aggregate';
import { BookingReminderJob } from './booking-reminder.job';

// TD24-S03: proves the cron double-send fix through the REAL outbox (Postgres UNIQUE(dedup_key))
// instead of just asserting matching dedupKey values in-memory (booking-reminder.job.spec.ts
// already covers that at the domain level) — this is the mechanism that actually collapses two
// overlapping/retried job runs into one delivered message.
describe('BookingReminderJob (integration, TD24-S03 cron double-send fix)', () => {
  let ds: DataSource;
  let txManager: TypeOrmTransactionManager;
  let outboxRepo: TypeOrmOutboxRepository;
  let eventBus: jest.Mocked<IEventBus>;
  let tenantPort: InMemoryBookingPlatformPort;
  let bookingRepo: InMemoryBookingRepository;
  let customerProfilePort: InMemoryBookingCustomerPort;

  const TOMORROW = new Date('2026-06-02T09:00:00.000Z');
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
    tenantPort = new InMemoryBookingPlatformPort();
    bookingRepo = new InMemoryBookingRepository();
    customerProfilePort = new InMemoryBookingCustomerPort();
  });

  function makeOutboxPublisher(): IOutboxPublisher {
    const config = makeConfigService({ OUTBOX_INLINE_DISPATCH_ENABLED: false });
    const relay = new OutboxRelayService(outboxRepo, eventBus, config);
    return new OutboxPublisher(outboxRepo, relay, config);
  }

  it('two overlapping runs for the same day → exactly one outbox row, relay delivers exactly one message', async () => {
    const tenantId = uuidv7();
    tenantPort.seed([{ id: tenantId, timezone: 'UTC' }]);
    const booking = new BookingBuilder()
      .withTenantId(tenantId)
      .withStatus(BookingStatus.APPROVED)
      .withScheduledAt(TOMORROW)
      .withLines([new BookingLineBuilder().build()])
      .build();
    await bookingRepo.save(booking);

    const job = new BookingReminderJob(
      tenantPort,
      bookingRepo,
      customerProfilePort,
      makeOutboxPublisher(),
      txManager,
    );

    // Two overlapping/retried invocations constructing the same business fact independently.
    await job.run(NOW_IN);
    await job.run(NOW_IN);

    const rows = await ds
      .getRepository(OutboxEventEntity)
      .find({ where: { eventName: 'BookingReminderDue', tenantId } });
    expect(rows).toHaveLength(1);

    // Explicit row id (bypasses the sweep's grace window, which a freshly-inserted row wouldn't
    // clear yet) — this is the same call shape OutboxPublisher's own inline dispatch uses.
    const relay = new OutboxRelayService(outboxRepo, eventBus, makeConfigService());
    await relay.relay([rows[0].id]);

    expect(eventBus.publish).toHaveBeenCalledTimes(1);
  });

  it('mid-run crash on one tenant leaves the other tenant unaffected; re-run completes only the crashed tenant, no duplicate for the one that already committed', async () => {
    const healthyTenantId = uuidv7();
    const crashingTenantId = uuidv7();
    tenantPort.seed([
      { id: healthyTenantId, timezone: 'UTC' },
      { id: crashingTenantId, timezone: 'UTC' },
    ]);
    const healthyBooking = new BookingBuilder()
      .withTenantId(healthyTenantId)
      .withStatus(BookingStatus.APPROVED)
      .withScheduledAt(TOMORROW)
      .withLines([new BookingLineBuilder().build()])
      .build();
    const crashingBooking = new BookingBuilder()
      .withTenantId(crashingTenantId)
      .withStatus(BookingStatus.APPROVED)
      .withScheduledAt(TOMORROW)
      .withLines([new BookingLineBuilder().build()])
      .build();
    await bookingRepo.save(healthyBooking);
    await bookingRepo.save(crashingBooking);

    // Fails only the crashing tenant's publish — its whole per-tenant transaction rolls back,
    // while the healthy tenant's own (independent) transaction has already committed.
    const realPublisher = makeOutboxPublisher();
    const crashingPublisher: IOutboxPublisher = {
      publish: (event) => {
        if (event.tenantId === crashingTenantId) {
          return Promise.reject(new Error('simulated mid-run crash'));
        }
        return realPublisher.publish(event);
      },
    };

    const crashingJob = new BookingReminderJob(
      tenantPort,
      bookingRepo,
      customerProfilePort,
      crashingPublisher,
      txManager,
    );

    // The healthy tenant is iterated first (insertion order) and commits; the crashing tenant's
    // transaction throws and propagates out of run() once its turn comes.
    await expect(crashingJob.run(NOW_IN)).rejects.toThrow('simulated mid-run crash');

    const rowsAfterCrash = await ds.getRepository(OutboxEventEntity).find();
    const healthyRowsAfterCrash = rowsAfterCrash.filter((r) => r.tenantId === healthyTenantId);
    const crashingRowsAfterCrash = rowsAfterCrash.filter((r) => r.tenantId === crashingTenantId);
    expect(healthyRowsAfterCrash).toHaveLength(1);
    expect(crashingRowsAfterCrash).toHaveLength(0);

    // Re-run with a working publisher: the healthy tenant's fact is a no-op conflict (same
    // dedupKey), the crashing tenant's fact is completed — no duplicate, no dropped remainder.
    const retryJob = new BookingReminderJob(
      tenantPort,
      bookingRepo,
      customerProfilePort,
      makeOutboxPublisher(),
      txManager,
    );
    await retryJob.run(NOW_IN);

    const rowsAfterRetry = await ds.getRepository(OutboxEventEntity).find();
    const healthyRowsAfterRetry = rowsAfterRetry.filter((r) => r.tenantId === healthyTenantId);
    const crashingRowsAfterRetry = rowsAfterRetry.filter((r) => r.tenantId === crashingTenantId);
    expect(healthyRowsAfterRetry).toHaveLength(1);
    expect(crashingRowsAfterRetry).toHaveLength(1);
  });
});
