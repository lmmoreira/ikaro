import { DataSource } from 'typeorm';
import { uuidv7 } from '../../../../shared/domain/uuid-v7';
import { OutboxEventEntity } from '../../../../shared/infrastructure/outbox/outbox-event.entity';
import { OutboxPublisher } from '../../../../shared/infrastructure/outbox/outbox-publisher';
import { OutboxRelayService } from '../../../../shared/infrastructure/outbox/outbox-relay.service';
import { TypeOrmOutboxRepository } from '../../../../shared/infrastructure/outbox/typeorm-outbox.repository';
import { TypeOrmTransactionManager } from '../../../../shared/infrastructure/typeorm-transaction-manager';
import {
  addDaysUTC,
  localDateStartUTC,
  utcDateToLocalDate,
} from '../../../../shared/utils/calendar-date';
import {
  BillingAccountBuilder,
  ChargeBuilder,
  SubscriptionEntityBuilder,
} from '../../../../test/builders/billing';
import { AdvanceableClock } from '../../../../test/infrastructure/advanceable-clock';
import { makeConfigService } from '../../../../test/infrastructure/fake-config-service';
import { InMemoryInboxRepository } from '../../../../test/infrastructure/in-memory-inbox.repository';
import { RoutingInMemoryEventBus } from '../../../../test/infrastructure/routing-in-memory-event-bus';
import { createTestDataSource } from '../../../../test/test-datasource';
import { BillingAccountEntity } from '../../infrastructure/entities/billing-account.entity';
import { ChargeEntity } from '../../infrastructure/entities/charge.entity';
import { ProviderHealthEntity } from '../../infrastructure/entities/provider-health.entity';
import { SubscriptionEntity } from '../../infrastructure/entities/subscription.entity';
import { TypeOrmBillingAccountRepository } from '../../infrastructure/repositories/typeorm-billing-account.repository';
import { TypeOrmChargeRepository } from '../../infrastructure/repositories/typeorm-charge.repository';
import { TypeOrmProviderHealthRepository } from '../../infrastructure/repositories/typeorm-provider-health.repository';
import { TypeOrmSubscriptionRepository } from '../../infrastructure/repositories/typeorm-subscription.repository';
import { PublishSubscriptionRemindersUseCase } from '../use-cases/publish-subscription-reminders.use-case';
import { PublishBillingRemindersJob } from './publish-billing-reminders.job';

const SAO_PAULO = 'America/Sao_Paulo';
const DAY_MS = 24 * 60 * 60 * 1000;

// The real repositories, the real selection SQL and the real outbox (`UNIQUE(dedup_key)`) against
// Postgres, composed by hand like the other Billing job suites. The clock is an advanceable one that
// starts now, so every date is relative to today in São Paulo.
describe('PublishBillingRemindersJob (integration, UC-139)', () => {
  let ds: DataSource;
  let clock: AdvanceableClock;
  let job: PublishBillingRemindersJob;
  let txManager: TypeOrmTransactionManager;
  let charges: TypeOrmChargeRepository;
  const tenants: string[] = [];

  const localToday = (): string => utcDateToLocalDate(clock.now(), SAO_PAULO);
  const localDay = (offset: number): string => addDaysUTC(localToday(), offset);

  // A trialing subscription ending `daysToEnd` local days from today, with a billing account.
  const seedTrial = async (daysToEnd: number, billingEmail: string | null = null) => {
    const tenantId = uuidv7();
    tenants.push(tenantId);
    const subscription = new SubscriptionEntityBuilder()
      .withTenantId(tenantId)
      .withStatus('TRIALING')
      .withTrialEndsAt(localDateStartUTC(localDay(daysToEnd), SAO_PAULO))
      .build();
    await ds.getRepository(SubscriptionEntity).insert(subscription);
    const account = new BillingAccountBuilder()
      .withTenantId(tenantId)
      .withBillingEmail(billingEmail);
    await txManager.run(() =>
      new TypeOrmBillingAccountRepository(ds.getRepository(BillingAccountEntity)).save(
        account.build(),
      ),
    );
    return { tenantId, subscriptionId: subscription.id };
  };

  // An ACTIVE subscription with one open renewal charge due `daysToDue` local days from today.
  const seedRenewal = async (daysToDue: number) => {
    const tenantId = uuidv7();
    tenants.push(tenantId);
    const subscription = new SubscriptionEntityBuilder()
      .withTenantId(tenantId)
      .withStatus('ACTIVE')
      .build();
    await ds.getRepository(SubscriptionEntity).insert(subscription);
    const charge = new ChargeBuilder()
      .withTenantId(tenantId)
      .withSubscriptionId(subscription.id)
      .withDueDate(localDay(daysToDue))
      .withVersion(undefined)
      .build();
    await charges.save(charge);
    return { tenantId, chargeId: charge.id };
  };

  const reminderRows = async (tenantId: string): Promise<string[]> =>
    (
      await ds
        .getRepository(OutboxEventEntity)
        .find({ where: { tenantId, eventName: 'BillingReminderDue' }, order: { createdAt: 'ASC' } })
    ).map((row) => row.dedupKey.split(':').slice(3).join(':'));

  beforeAll(async () => {
    ds = await createTestDataSource();
    txManager = new TypeOrmTransactionManager(ds);
    const outboxRepo = new TypeOrmOutboxRepository(ds.getRepository(OutboxEventEntity));
    const config = makeConfigService({ OUTBOX_INLINE_DISPATCH_ENABLED: false });
    const relay = new OutboxRelayService(
      outboxRepo,
      new RoutingInMemoryEventBus(),
      new InMemoryInboxRepository(),
      config,
      txManager,
    );
    const outbox = new OutboxPublisher(outboxRepo, relay, config);
    clock = new AdvanceableClock(new Date());
    const subscriptions = new TypeOrmSubscriptionRepository(
      ds.getRepository(SubscriptionEntity),
      outbox,
    );
    charges = new TypeOrmChargeRepository(ds.getRepository(ChargeEntity), outbox);
    const accounts = new TypeOrmBillingAccountRepository(ds.getRepository(BillingAccountEntity));
    const health = new TypeOrmProviderHealthRepository(ds.getRepository(ProviderHealthEntity));
    const publishOne = new PublishSubscriptionRemindersUseCase(
      subscriptions,
      charges,
      accounts,
      outbox,
      txManager,
      clock,
    );
    job = new PublishBillingRemindersJob(subscriptions, charges, health, clock, publishOne);
  });

  afterEach(async () => {
    if (tenants.length > 0) {
      await ds.query(`DELETE FROM "shared"."outbox" WHERE "tenant_id" = ANY($1::uuid[])`, [
        tenants,
      ]);
      for (const table of [
        'charge_lines',
        'charges',
        'billing_accounts',
        'subscription_items',
        'subscriptions',
      ]) {
        await ds.query(`DELETE FROM "billing"."${table}" WHERE "tenant_id" = ANY($1::uuid[])`, [
          tenants,
        ]);
      }
      tenants.length = 0;
    }
  });

  afterAll(async () => {
    await ds.destroy();
  });

  it('running the job twice on one day writes each milestone once', async () => {
    const trial = await seedTrial(7);

    await job.run({ correlationId: 'corr-1' });
    await job.run({ correlationId: 'corr-2' });

    expect(await reminderRows(trial.tenantId)).toEqual(
      expect.arrayContaining([expect.stringContaining('PLAN_CONFIRMATION:7:none')]),
    );
    expect(await reminderRows(trial.tenantId)).toHaveLength(2);
  });

  it('two runs at the same time still write each milestone once (the outbox dedup_key holds under concurrency)', async () => {
    const trial = await seedTrial(7);
    const renewal = await seedRenewal(3);

    await Promise.all([job.run({ correlationId: 'corr-a' }), job.run({ correlationId: 'corr-b' })]);

    expect(await reminderRows(trial.tenantId)).toHaveLength(2);
    expect(await reminderRows(renewal.tenantId)).toEqual([`CHARGE_DUE_SOON:3:${renewal.chargeId}`]);
  });

  it('one run covers several tenants and each reminder carries its own tenant', async () => {
    const tenantA = await seedTrial(7, 'a@example.test');
    const tenantB = await seedTrial(3, 'b@example.test');
    const renewal = await seedRenewal(3);

    await job.run({ correlationId: 'corr-tenants' });

    const rowsOf = (tenantId: string) =>
      ds
        .getRepository(OutboxEventEntity)
        .find({ where: { tenantId, eventName: 'BillingReminderDue' } });
    expect((await rowsOf(tenantA.tenantId)).map((r) => r.payload['data'])).toEqual(
      expect.arrayContaining([expect.objectContaining({ recipientEmail: 'a@example.test' })]),
    );
    expect(await reminderRows(tenantA.tenantId)).toHaveLength(2);
    expect(await reminderRows(tenantB.tenantId)).toEqual(['TRIAL_ENDING:3:none']);
    expect(await reminderRows(renewal.tenantId)).toHaveLength(1);
    for (const tenantId of [tenantA.tenantId, tenantB.tenantId, renewal.tenantId]) {
      const rows = await rowsOf(tenantId);
      expect(rows.every((row) => row.tenantId === tenantId)).toBe(true);
    }
  });

  it('walks one trial day by day on the clock and writes the exact sequence through the real selection windows', async () => {
    const trial = await seedTrial(10);

    for (let elapsed = 0; elapsed <= 10; elapsed += 1) {
      await job.run({ correlationId: `corr-day-${elapsed}` });
      clock.advanceMs(DAY_MS);
    }

    expect((await reminderRows(trial.tenantId)).sort()).toEqual(
      [
        'PLAN_CONFIRMATION:10:none',
        'PLAN_CONFIRMATION:7:none',
        'PLAN_CONFIRMATION:4:none',
        'TRIAL_ENDING:7:none',
        'TRIAL_ENDING:3:none',
        'TRIAL_ENDING:0:none',
      ].sort(),
    );
  });
});
