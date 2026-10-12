import { DataSource } from 'typeorm';
import { uuidv7 } from '../../../../shared/domain/uuid-v7';
import { OutboxEventEntity } from '../../../../shared/infrastructure/outbox/outbox-event.entity';
import { TypeOrmOutboxRepository } from '../../../../shared/infrastructure/outbox/typeorm-outbox.repository';
import { TypeOrmTransactionManager } from '../../../../shared/infrastructure/typeorm-transaction-manager';
import {
  RecurringBookingScheduleBuilder,
  ServiceEntityBuilder,
} from '../../../../test/builders/booking/index';
import { makeRealOutboxPublisher } from '../../../../test/factories/real-outbox-publisher.factory';
import { InMemoryBookingPlatformPort } from '../../../../test/infrastructure/in-memory-booking-platform.port';
import { InMemoryEventBus } from '../../../../test/infrastructure/in-memory-event-bus';
import { createTestDataSource } from '../../../../test/test-datasource';
import { RecurringBookingScheduleEntity } from '../../infrastructure/entities/recurring-booking-schedule.entity';
import { RecurringBookingScheduleResourceAssignmentEntity } from '../../infrastructure/entities/recurring-booking-schedule-resource-assignment.entity';
import { ServiceEntity } from '../../infrastructure/entities/service.entity';
import { TypeOrmRecurringBookingScheduleRepository } from '../../infrastructure/repositories/typeorm-recurring-booking-schedule.repository';
import { RecurringScheduleRenewalReminderJob } from './recurring-schedule-renewal-reminder.job';

// M23-S21: one reminder per schedule through the REAL outbox (Postgres UNIQUE(dedup_key)), which is
// what collapses a retried or overlapping cron tick into a single delivered message — the mechanism
// the "at most one email per schedule" criterion rests on.
describe('RecurringScheduleRenewalReminderJob (integration)', () => {
  let ds: DataSource;
  let repo: TypeOrmRecurringBookingScheduleRepository;
  let outboxRepo: TypeOrmOutboxRepository;
  let txManager: TypeOrmTransactionManager;
  let platform: InMemoryBookingPlatformPort;
  let job: RecurringScheduleRenewalReminderJob;

  const tenantA = uuidv7();
  const tenantB = uuidv7();
  const serviceA = uuidv7();
  const serviceB = uuidv7();
  // 06:15 in São Paulo on 2026-10-12.
  const NOW = new Date('2026-10-12T09:15:00.000Z');
  const IN_SEVEN_DAYS = '2026-10-19';

  beforeAll(async () => {
    ds = await createTestDataSource();
    repo = new TypeOrmRecurringBookingScheduleRepository(
      ds.getRepository(RecurringBookingScheduleEntity),
      ds.getRepository(RecurringBookingScheduleResourceAssignmentEntity),
      new InMemoryEventBus(),
    );
    outboxRepo = new TypeOrmOutboxRepository(ds.getRepository(OutboxEventEntity));
    txManager = new TypeOrmTransactionManager(ds);
    await ds
      .getRepository(ServiceEntity)
      .save([
        new ServiceEntityBuilder().withId(serviceA).withTenantId(tenantA).build(),
        new ServiceEntityBuilder().withId(serviceB).withTenantId(tenantB).build(),
      ]);
    platform = new InMemoryBookingPlatformPort();
    platform.seed([
      { id: tenantA, timezone: 'America/Sao_Paulo' },
      { id: tenantB, timezone: 'America/Sao_Paulo' },
    ]);
    platform.seedRecurringRenewalSettings(tenantA, {
      timezone: 'America/Sao_Paulo',
      reminderDays: 7,
    });
    platform.seedRecurringRenewalSettings(tenantB, {
      timezone: 'America/Sao_Paulo',
      reminderDays: 3,
    });
    job = new RecurringScheduleRenewalReminderJob(
      platform,
      repo,
      makeRealOutboxPublisher(outboxRepo, new InMemoryEventBus()),
      txManager,
    );
  });

  afterAll(async () => {
    await ds
      .getRepository(OutboxEventEntity)
      .delete([{ tenantId: tenantA }, { tenantId: tenantB }]);
    await ds
      .getRepository(RecurringBookingScheduleEntity)
      .delete([{ tenantId: tenantA }, { tenantId: tenantB }]);
    await ds.getRepository(ServiceEntity).delete([{ tenantId: tenantA }, { tenantId: tenantB }]);
    await ds.destroy();
  });

  const outboxRows = (tenantId: string) =>
    ds.getRepository(OutboxEventEntity).find({
      where: { eventName: 'RecurringScheduleRenewalDue', tenantId },
    });

  it('picks only the schedule ending in 7 days among 6, 7 and 8, and no ended, cancelled or pending one', async () => {
    const customer = uuidv7();
    const pick = (endsOn: string, status: 'ACTIVE' | 'ENDED' | 'PENDING_APPROVAL' = 'ACTIVE') =>
      new RecurringBookingScheduleBuilder()
        .withTenantId(tenantA)
        .withCustomerId(uuidv7())
        .withServiceId(serviceA)
        .withTerm('2026-08-01', endsOn)
        .withStatus(status)
        .build();
    const exact = pick(IN_SEVEN_DAYS);
    const others = [
      pick('2026-10-18'),
      pick('2026-10-20'),
      pick(IN_SEVEN_DAYS, 'ENDED'),
      pick(IN_SEVEN_DAYS, 'PENDING_APPROVAL'),
      new RecurringBookingScheduleBuilder()
        .withTenantId(tenantA)
        .withCustomerId(customer)
        .withServiceId(serviceA)
        .withTerm('2026-08-01', IN_SEVEN_DAYS)
        .withStatus('CANCELLED')
        .build(),
    ];
    for (const s of [exact, ...others]) await repo.save(s);

    await job.run(NOW);

    const rows = await outboxRows(tenantA);
    expect(
      rows.map(
        (r) => (r.payload as { data: { recurringScheduleId: string } }).data.recurringScheduleId,
      ),
    ).toEqual([exact.id]);
  });

  it('a second run on the same day (and an overlapping one) creates no second row', async () => {
    const before = (await outboxRows(tenantA)).length;

    await Promise.all([job.run(NOW), job.run(NOW)]);

    expect(await outboxRows(tenantA)).toHaveLength(before);
  });

  it("uses each tenant's own lead time and never reminds across tenants (tenant isolation)", async () => {
    const forB = new RecurringBookingScheduleBuilder()
      .withTenantId(tenantB)
      .withCustomerId(uuidv7())
      .withServiceId(serviceB)
      .withTerm('2026-08-01', '2026-10-15')
      .build();
    const notForB = new RecurringBookingScheduleBuilder()
      .withTenantId(tenantB)
      .withCustomerId(uuidv7())
      .withServiceId(serviceB)
      .withTerm('2026-08-01', IN_SEVEN_DAYS)
      .build();
    for (const s of [forB, notForB]) await repo.save(s);

    await job.run(NOW);

    const rows = await outboxRows(tenantB);
    expect(rows).toHaveLength(1);
    expect(
      (rows[0].payload as { data: { recurringScheduleId: string } }).data.recurringScheduleId,
    ).toBe(forB.id);
    expect(await outboxRows(tenantA)).toHaveLength(1);
  });
});
