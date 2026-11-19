import { DataSource, Repository } from 'typeorm';
import { LogDomainEventUseCase } from '../../../../shared/application/use-cases/log-domain-event.use-case';
import { Envelope } from '../../../../shared/domain/envelope';
import { uuidv7 } from '../../../../shared/domain/uuid-v7';
import { OutboxEventEntity } from '../../../../shared/infrastructure/outbox/outbox-event.entity';
import { OutboxPublisher } from '../../../../shared/infrastructure/outbox/outbox-publisher';
import { OutboxRelayService } from '../../../../shared/infrastructure/outbox/outbox-relay.service';
import { TypeOrmOutboxRepository } from '../../../../shared/infrastructure/outbox/typeorm-outbox.repository';
import { TypeOrmTransactionManager } from '../../../../shared/infrastructure/typeorm-transaction-manager';
import {
  BillingReminderDueCommandBuilder,
  ChargeIssuedEventBuilder,
  ChargePaidEventBuilder,
  PlanChangedEventBuilder,
  SubscriptionCancelledEventBuilder,
  SubscriptionPastDueEventBuilder,
  SubscriptionPriceChangeAnnouncedEventBuilder,
} from '../../../../test/builders/billing';
import { makeConfigService } from '../../../../test/infrastructure/fake-config-service';
import { InMemoryInboxRepository } from '../../../../test/infrastructure/in-memory-inbox.repository';
import { RoutingInMemoryEventBus } from '../../../../test/infrastructure/routing-in-memory-event-bus';
import { createTestDataSource } from '../../../../test/test-datasource';
import { BillingAuditLogHandler } from './billing-audit-log.handler';

// M26-S03: the new Billing events travel through the real outbox (committed with the business
// write) to the audit-log consumer, and the reminder Command collapses on its business dedup key.
describe('Billing events through the outbox (integration)', () => {
  let dataSource: DataSource;
  let txManager: TypeOrmTransactionManager;
  let outboxRows: Repository<OutboxEventEntity>;
  let publisher: OutboxPublisher;
  let auditInbox: InMemoryInboxRepository;
  const tenants: string[] = [];

  const newTenant = (): string => {
    const tenantId = uuidv7();
    tenants.push(tenantId);
    return tenantId;
  };

  beforeAll(async () => {
    dataSource = await createTestDataSource();
    txManager = new TypeOrmTransactionManager(dataSource);
    outboxRows = dataSource.getRepository(OutboxEventEntity);
    const outboxRepo = new TypeOrmOutboxRepository(outboxRows);
    const bus = new RoutingInMemoryEventBus();
    auditInbox = new InMemoryInboxRepository();
    new BillingAuditLogHandler(new LogDomainEventUseCase(auditInbox), bus).onModuleInit();
    const config = makeConfigService({ OUTBOX_INLINE_DISPATCH_ENABLED: true });
    const relay = new OutboxRelayService(
      outboxRepo,
      bus,
      new InMemoryInboxRepository(),
      config,
      txManager,
    );
    publisher = new OutboxPublisher(outboxRepo, relay, config);
  });

  afterEach(async () => {
    auditInbox.clear();
    if (tenants.length > 0) {
      await dataSource.query(`DELETE FROM "shared"."outbox" WHERE "tenant_id" = ANY($1::uuid[])`, [
        tenants,
      ]);
      tenants.length = 0;
    }
  });

  afterAll(async () => {
    await dataSource.destroy();
  });

  it('publishes each new domain event after commit and the audit-log consumer claims it', async () => {
    const tenantA = newTenant();
    const tenantB = newTenant();
    const events: Envelope[] = [
      new ChargeIssuedEventBuilder().withTenantId(tenantA).build(),
      new ChargePaidEventBuilder().withTenantId(tenantA).build(),
      new SubscriptionPastDueEventBuilder().withTenantId(tenantA).build(),
      new SubscriptionCancelledEventBuilder().withTenantId(tenantA).build(),
      new PlanChangedEventBuilder().withTenantId(tenantA).build(),
      new SubscriptionPriceChangeAnnouncedEventBuilder().withTenantId(tenantB).build(),
    ];

    await txManager.run(async () => {
      for (const event of events) await publisher.publish(event);
    });

    for (const event of events) {
      expect(
        await auditInbox.hasBeenProcessed(event.eventId, LogDomainEventUseCase.CONSUMER_NAME),
      ).toBe(true);
    }
    const rows = await outboxRows.find({ where: { tenantId: tenantA } });
    expect(rows).toHaveLength(5);
    expect(rows.every((row) => row.publishedAt !== null)).toBe(true);
    expect(await outboxRows.find({ where: { tenantId: tenantB } })).toHaveLength(1);
  });

  it('leaves no outbox row and no audit-log call when the transaction rolls back', async () => {
    const tenantId = newTenant();

    const event = new ChargeIssuedEventBuilder().withTenantId(tenantId).build();

    await expect(
      txManager.run(async () => {
        await publisher.publish(event);
        throw new Error('a later step failed');
      }),
    ).rejects.toThrow('a later step failed');

    expect(await outboxRows.find({ where: { tenantId } })).toHaveLength(0);
    expect(
      await auditInbox.hasBeenProcessed(event.eventId, LogDomainEventUseCase.CONSUMER_NAME),
    ).toBe(false);
  });

  it('collapses two BillingReminderDue commands with the same business key into one outbox row, whatever the recipient', async () => {
    const tenantId = newTenant();
    const build = (recipientEmail: string | null) =>
      new BillingReminderDueCommandBuilder()
        .withTenantId(tenantId)
        .withSubscriptionId('sub-1')
        .withKind('CHARGE_DUE_SOON')
        .withDaysOffset(3)
        .withChargeId('charge-1')
        .withRecipientEmail(recipientEmail)
        .build();

    await txManager.run(() => publisher.publish(build('a@example.test')));
    await txManager.run(() => publisher.publish(build(null)));

    const rows = await outboxRows.find({ where: { tenantId } });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.dedupKey).toBe(
      'BillingReminderDue:' + tenantId + ':sub-1:CHARGE_DUE_SOON:3:charge-1',
    );
  });

  it('keeps reminders for different milestones apart (another offset is another row)', async () => {
    const tenantId = newTenant();
    const build = (daysOffset: number) =>
      new BillingReminderDueCommandBuilder()
        .withTenantId(tenantId)
        .withSubscriptionId('sub-1')
        .withDaysOffset(daysOffset)
        .build();

    await txManager.run(() => publisher.publish(build(3)));
    await txManager.run(() => publisher.publish(build(1)));

    expect(await outboxRows.find({ where: { tenantId } })).toHaveLength(2);
  });
});
