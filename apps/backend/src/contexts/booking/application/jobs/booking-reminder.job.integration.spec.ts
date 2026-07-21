import { DataSource } from 'typeorm';
import { IOutboxPublisher } from '../../../../shared/ports/outbox-publisher.port';
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
  let eventBus: InMemoryEventBus;
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
    eventBus = new InMemoryEventBus();
    tenantPort = new InMemoryBookingPlatformPort();
    bookingRepo = new InMemoryBookingRepository();
    customerProfilePort = new InMemoryBookingCustomerPort();
  });

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
      makeRealOutboxPublisher(outboxRepo, eventBus),
      txManager,
    );

    // Genuinely concurrent, not sequential — both transactions race for the same dedup_key row,
    // which is what "overlapping" actually means (a sequential await pair would only prove retry
    // dedup after the first run's transaction already committed).
    await Promise.all([job.run(NOW_IN), job.run(NOW_IN)]);

    const rows = await ds
      .getRepository(OutboxEventEntity)
      .find({ where: { eventName: 'BookingReminderDue', tenantId } });
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

    // Row's own DB state, not this call's local eventBus mock (outbox-relay.service.integration.spec.ts's
    // "SKIP LOCKED" test documents why: the sweep scans the whole shared.outbox table with no
    // per-test scoping, and other spec files in this suite deliberately configure
    // OUTBOX_SWEEP_GRACE_SECONDS: 0 — if one of those sweeps claims and publishes this exact row
    // between insertion and this relay.relay() call, findUnpublishedById() correctly finds
    // nothing left to do and this test's own eventBus.published would be a false-negative 0,
    // even though the row genuinely got published — which is the only invariant this assertion
    // needs to prove (exactly-once delivery of the deduplicated row is covered separately by the
    // toHaveLength(1) row-count assertion above plus the SKIP LOCKED dedup test).
    const publishedRow = await ds.getRepository(OutboxEventEntity).findOne({
      where: { id: rows[0].id },
    });
    expect(publishedRow!.publishedAt).not.toBeNull();
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
    const realPublisher = makeRealOutboxPublisher(outboxRepo, eventBus);
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
      makeRealOutboxPublisher(outboxRepo, eventBus),
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
