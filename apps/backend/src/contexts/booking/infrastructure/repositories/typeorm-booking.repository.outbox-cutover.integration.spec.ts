import { DataSource, Repository } from 'typeorm';
import {
  BookingBuilder,
  BookingLineBuilder,
  ServiceEntityBuilder,
} from '../../../../test/builders/booking/index';
import { makeConfigService } from '../../../../test/infrastructure/fake-config-service';
import { InMemoryTenantSettingsPort } from '../../../../test/infrastructure/in-memory-tenant-settings.port';
import { createTestDataSource } from '../../../../test/test-datasource';
import { uuidv7 } from '../../../../shared/domain/uuid-v7';
import { InboxRecordEntity } from '../../../../shared/infrastructure/inbox/inbox-record.entity';
import { TypeOrmInboxRepository } from '../../../../shared/infrastructure/inbox/typeorm-inbox.repository';
import { OutboxEventEntity } from '../../../../shared/infrastructure/outbox/outbox-event.entity';
import { OutboxPublisher } from '../../../../shared/infrastructure/outbox/outbox-publisher';
import { OutboxRelayService } from '../../../../shared/infrastructure/outbox/outbox-relay.service';
import { TypeOrmOutboxRepository } from '../../../../shared/infrastructure/outbox/typeorm-outbox.repository';
import { IEventBus } from '../../../../shared/ports/event-bus.port';
import { Booking } from '../../domain/booking.aggregate';
import { BookingEntity } from '../entities/booking.entity';
import { BookingLineEntity } from '../entities/booking-line.entity';
import { ServiceEntity } from '../entities/service.entity';
import { TypeOrmBookingRepository } from './typeorm-booking.repository';

// TD24-S02 — proves the cutover wiring (repo.save() → drainDomainEvents() → OutboxPublisher)
// carries the same delivery guarantees S01 already proved at the OutboxPublisher/OutboxRelayService
// level, but starting from a real aggregate + real repository instead of a synthetic StubEvent —
// this is TD08 AUD-003's executable spec for the booking cutover specifically.
describe('Booking → Outbox cutover (integration, TD24-S02)', () => {
  let dataSource: DataSource;
  let outboxRepo: Repository<OutboxEventEntity>;
  let typeOrmOutboxRepo: TypeOrmOutboxRepository;
  let typeOrmInboxRepo: TypeOrmInboxRepository;
  let settingsPort: InMemoryTenantSettingsPort;
  const TENANT_ID = uuidv7();
  const SERVICE_ID = uuidv7();
  const STAFF_ID = '20000000-0000-4000-8000-000000009001';
  const CORRELATION_ID = 'corr-outbox-cutover-test';

  beforeAll(async () => {
    dataSource = await createTestDataSource();
    outboxRepo = dataSource.getRepository(OutboxEventEntity);
    typeOrmOutboxRepo = new TypeOrmOutboxRepository(outboxRepo);
    typeOrmInboxRepo = new TypeOrmInboxRepository(dataSource.getRepository(InboxRecordEntity));
    settingsPort = new InMemoryTenantSettingsPort();

    const svc = new ServiceEntityBuilder().withId(SERVICE_ID).withTenantId(TENANT_ID).build();
    await dataSource.getRepository(ServiceEntity).save(svc);
  });

  beforeEach(async () => {
    await dataSource.getRepository(BookingLineEntity).delete({ tenantId: TENANT_ID });
    await dataSource.getRepository(BookingEntity).delete({ tenantId: TENANT_ID });
    await outboxRepo.delete({ tenantId: TENANT_ID });
  });

  afterAll(async () => {
    await dataSource.destroy();
  });

  function makeRepo(outboxPublisher: OutboxPublisher): TypeOrmBookingRepository {
    return new TypeOrmBookingRepository(
      dataSource.getRepository(BookingEntity),
      dataSource.getRepository(BookingLineEntity),
      settingsPort,
      outboxPublisher,
    );
  }

  // A BookingBuilder aggregate is built via Booking.reconstitute() — no domain events pending —
  // so this seed save drains nothing. The real event under test comes from .approve() below.
  async function seedPendingBooking(repo: TypeOrmBookingRepository): Promise<Booking> {
    const booking = new BookingBuilder()
      .withTenantId(TENANT_ID)
      .withLines([
        new BookingLineBuilder().withTenantId(TENANT_ID).withServiceId(SERVICE_ID).build(),
      ])
      .build();
    await repo.save(booking);
    return booking;
  }

  it('crash-between-commit-and-publish: inline dispatch disabled → row unpublished, no Pub/Sub message; relay then delivers exactly one message', async () => {
    const eventBus = {
      publish: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<IEventBus>;
    const config = makeConfigService({ OUTBOX_INLINE_DISPATCH_ENABLED: false });
    const relay = new OutboxRelayService(typeOrmOutboxRepo, eventBus, typeOrmInboxRepo, config);
    const outboxPublisher = new OutboxPublisher(typeOrmOutboxRepo, relay, config);
    const repo = makeRepo(outboxPublisher);

    const booking = await seedPendingBooking(repo);
    booking.approve(STAFF_ID, CORRELATION_ID);
    const pendingEventId = booking.domainEvents[0].eventId;
    await repo.save(booking);

    const rowAfterCommit = await outboxRepo.findOne({ where: { id: pendingEventId } });
    expect(rowAfterCommit).not.toBeNull();
    expect(rowAfterCommit!.publishedAt).toBeNull();
    expect(eventBus.publish).not.toHaveBeenCalled();

    await relay.relay([pendingEventId]);

    const rowAfterRelay = await outboxRepo.findOne({ where: { id: pendingEventId } });
    expect(rowAfterRelay!.publishedAt).not.toBeNull();
    expect(eventBus.publish).toHaveBeenCalledTimes(1);
  });

  it('inline publish failure: booking approval still succeeds; row stays unpublished; the sweep retries and delivers', async () => {
    const eventBus = {
      publish: jest
        .fn()
        .mockRejectedValueOnce(new Error('pubsub down'))
        .mockResolvedValue(undefined),
    } as unknown as jest.Mocked<IEventBus>;
    const config = makeConfigService({
      OUTBOX_INLINE_DISPATCH_ENABLED: true,
      OUTBOX_SWEEP_GRACE_SECONDS: 0,
    });
    const relay = new OutboxRelayService(typeOrmOutboxRepo, eventBus, typeOrmInboxRepo, config);
    const outboxPublisher = new OutboxPublisher(typeOrmOutboxRepo, relay, config);
    const repo = makeRepo(outboxPublisher);

    const booking = await seedPendingBooking(repo);
    booking.approve(STAFF_ID, CORRELATION_ID);
    const pendingEventId = booking.domainEvents[0].eventId;

    // Inline dispatch error is swallowed inside the after-commit callback — save() (standing in
    // for the use case's own txManager.run()) resolves normally despite the failed publish.
    await expect(repo.save(booking)).resolves.toBeUndefined();

    const rowAfterInline = await outboxRepo.findOne({ where: { id: pendingEventId } });
    expect(rowAfterInline!.publishedAt).toBeNull();
    expect(eventBus.publish).toHaveBeenCalledTimes(1);

    // The scheduled sweep (no rowIds — SKIP LOCKED claim + grace window), not the targeted
    // inline-dispatch path, is what's under test here per this test's own name. The sweep scans
    // the whole shared.outbox table with no per-test scoping, so filter this call count by this
    // row's own eventId rather than asserting an aggregate total — an unrelated leftover row from
    // another concurrently-running test file (same shared Testcontainers Postgres instance) can
    // legitimately add extra calls without indicating a bug here (same caveat documented in
    // outbox-relay.service.integration.spec.ts's own sweep tests).
    await relay.relay();

    const rowAfterRetry = await outboxRepo.findOne({ where: { id: pendingEventId } });
    expect(rowAfterRetry!.publishedAt).not.toBeNull();
    const callsForThisEvent = eventBus.publish.mock.calls.filter(
      ([event]) => (event as { eventId: string }).eventId === pendingEventId,
    );
    expect(callsForThisEvent).toHaveLength(2); // 1 failed inline attempt + 1 successful sweep retry
  });

  it('two concurrent sweeps on the same booking-approval row (SKIP LOCKED) → exactly one Pub/Sub publish', async () => {
    const publishedEventIds: string[] = [];
    const eventBus = {
      publish: jest.fn().mockImplementation(async (event: { eventId: string }) => {
        publishedEventIds.push(event.eventId);
      }),
    } as unknown as jest.Mocked<IEventBus>;
    const config = makeConfigService({
      OUTBOX_INLINE_DISPATCH_ENABLED: false,
      OUTBOX_SWEEP_GRACE_SECONDS: 0,
    });
    const relay = new OutboxRelayService(typeOrmOutboxRepo, eventBus, typeOrmInboxRepo, config);
    const outboxPublisher = new OutboxPublisher(typeOrmOutboxRepo, relay, config);
    const repo = makeRepo(outboxPublisher);

    const booking = await seedPendingBooking(repo);
    booking.approve(STAFF_ID, CORRELATION_ID);
    const pendingEventId = booking.domainEvents[0].eventId;
    await repo.save(booking); // inline disabled — row stays unpublished after this commit

    await Promise.all([relay.relay(), relay.relay()]);

    const row = await outboxRepo.findOne({ where: { id: pendingEventId } });
    expect(row!.publishedAt).not.toBeNull();
    expect(publishedEventIds.filter((id) => id === pendingEventId)).toHaveLength(1);
  });
});
