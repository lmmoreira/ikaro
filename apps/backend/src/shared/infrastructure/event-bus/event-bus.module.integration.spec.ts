import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { BillingModule } from '../../../contexts/billing/billing.module';
import { DevClockModule } from '../../../contexts/billing/infrastructure/dev-clock.module';
import { BillingAccountEntity } from '../../../contexts/billing/infrastructure/entities/billing-account.entity';
import { FeaturePriceVersionEntity } from '../../../contexts/billing/infrastructure/entities/feature-price-version.entity';
import { FeaturePriceEntity } from '../../../contexts/billing/infrastructure/entities/feature-price.entity';
import { OperatorAuditEntity } from '../../../contexts/billing/infrastructure/entities/operator-audit.entity';
import { SignupRegistrationEntity } from '../../../contexts/billing/infrastructure/entities/signup-registration.entity';
import { SubscriptionItemEntity } from '../../../contexts/billing/infrastructure/entities/subscription-item.entity';
import { SubscriptionEntity } from '../../../contexts/billing/infrastructure/entities/subscription.entity';
import { HotsiteConfigEntity } from '../../../contexts/platform/infrastructure/entities/hotsite-config.entity';
import { TenantEntity } from '../../../contexts/platform/infrastructure/entities/tenant.entity';
import { SubscriptionEntityBuilder } from '../../../test/builders/billing';
import { TenantEntityBuilder } from '../../../test/builders/platform';
import { testCacheModule } from '../../../test/utils/test-cache-module';
import { testConfigModule } from '../../../test/utils/test-config-module';
import { Envelope } from '../../domain/envelope';
import { uuidv7 } from '../../domain/uuid-v7';
import { ClockModule } from '../clock/clock.module';
import { InboxModule } from '../inbox/inbox.module';
import { InboxRecordEntity } from '../inbox/inbox-record.entity';
import { OutboxEventEntity } from '../outbox/outbox-event.entity';
import { OutboxModule } from '../outbox/outbox.module';
import { OutboxRelayService } from '../outbox/outbox-relay.service';
import { TransactionManagerModule } from '../transaction-manager.module';
import { EVENT_BUS, EVENT_BUS_TRANSPORT, IEventBus } from '../../ports/event-bus.port';
import { IPushableEventBus, PUSHABLE_EVENT_BUS } from '../../ports/pushable-event-bus.port';
import { TENANT_ACCESS_PORT } from '../../ports/tenant-access.port';
import { TRIGGER_BUS } from '../../ports/trigger-bus.port';
import { EventBusModule } from './event-bus.module';
import { GatedEventBus } from './gated-event-bus';
import { GcpPubSubEventBusAdapter } from './gcp-pubsub-event-bus.adapter';

// M25-S21a: the production wiring, with nothing overridden. `compile()` resolves the whole
// dependency graph without running onApplicationBootstrap, so no Pub/Sub connection is opened.
//
// What it guards: EVENT_BUS (the gated bus) depends on TENANT_ACCESS_PORT, whose chain reaches
// OUTBOX_PUBLISHER and the outbox relay, which publishes through the bus. Were the relay to inject
// EVENT_BUS (or the transport to inject the access port), Nest would refuse to start with a
// circular dependency. This spec fails the moment that loop is reintroduced.
class BootEvent extends Envelope {
  readonly eventVersion = 1;
  readonly data = {};

  constructor(tenantId: string) {
    super(tenantId, uuidv7());
  }
}

describe('EventBusModule wiring (real module graph)', () => {
  let moduleRef: TestingModule;
  const tenantIds: string[] = [];

  beforeAll(async () => {
    // The real adapter's constructor reads it; nothing connects until onApplicationBootstrap.
    process.env['PUBSUB_PROJECT_ID'] = 'ikaro-local';
    moduleRef = await Test.createTestingModule({
      imports: [
        testConfigModule(),
        testCacheModule(),
        TypeOrmModule.forRoot({
          type: 'postgres',
          url: process.env['TEST_DATABASE_URL'],
          entities: [
            FeaturePriceEntity,
            FeaturePriceVersionEntity,
            SubscriptionEntity,
            SubscriptionItemEntity,
            BillingAccountEntity,
            SignupRegistrationEntity,
            OperatorAuditEntity,
            InboxRecordEntity,
            OutboxEventEntity,
            TenantEntity,
            HotsiteConfigEntity,
          ],
          synchronize: false,
        }),
        EventBusModule,
        OutboxModule,
        InboxModule,
        TransactionManagerModule,
        ClockModule.register('local'),
        DevClockModule.register('local'),
        BillingModule,
      ],
    }).compile();
  });

  afterAll(async () => {
    if (moduleRef && tenantIds.length > 0) {
      const ds = moduleRef.get(DataSource);
      await ds.query(`DELETE FROM "billing"."subscriptions" WHERE "tenant_id" = ANY($1::uuid[])`, [
        tenantIds,
      ]);
      await ds.query(`DELETE FROM "platform"."tenants" WHERE "id" = ANY($1::uuid[])`, [tenantIds]);
    }
    await moduleRef?.close();
    delete process.env['PUBSUB_PROJECT_ID'];
  });

  it('starts without a circular dependency, with the real access port behind the gate', () => {
    expect(moduleRef.get(TENANT_ACCESS_PORT)).toBeDefined();
  });

  it('gives handlers the gated bus under EVENT_BUS', () => {
    expect(moduleRef.get(EVENT_BUS)).toBeInstanceOf(GatedEventBus);
  });

  it('keeps one transport instance: the Pub/Sub adapter, shared with the trigger and push tokens', () => {
    const transport = moduleRef.get(EVENT_BUS_TRANSPORT);

    expect(transport).toBeInstanceOf(GcpPubSubEventBusAdapter);
    expect(moduleRef.get(TRIGGER_BUS)).toBe(transport);
    expect(moduleRef.get(PUSHABLE_EVENT_BUS)).toBe(transport);
  });

  it('keeps the outbox relay on the transport, never on the gated bus', () => {
    const injected = Reflect.getMetadata('self:paramtypes', OutboxRelayService) as Array<{
      index: number;
      param: unknown;
    }>;

    expect(injected.map((entry) => entry.param)).toContain(EVENT_BUS_TRANSPORT);
    expect(injected.map((entry) => entry.param)).not.toContain(EVENT_BUS);
  });

  it('delivers an opted-in event through the real graph: the operational tenant runs, the suspended one is skipped and acknowledged', async () => {
    const ds = moduleRef.get(DataSource);
    const seedTenant = async (
      configure: (builder: SubscriptionEntityBuilder) => SubscriptionEntityBuilder,
    ): Promise<string> => {
      const tenantId = uuidv7();
      tenantIds.push(tenantId);
      await ds
        .getRepository(TenantEntity)
        .insert(new TenantEntityBuilder().withId(tenantId).withSlug(`boot-${uuidv7()}`).build());
      await ds
        .getRepository(SubscriptionEntity)
        .insert(configure(new SubscriptionEntityBuilder().withTenantId(tenantId)).build());
      return tenantId;
    };
    const operational = await seedTenant((b) => b.withStatus('TRIALING'));
    const suspended = await seedTenant((b) => b.withSuspension('NON_PAYMENT', new Date()));

    const delivered: string[] = [];
    moduleRef.get<IEventBus>(EVENT_BUS).subscribe(
      BootEvent.name,
      async (event: BootEvent) => {
        delivered.push(event.tenantId);
      },
      'boot-consumer',
      { skipWhenSuspended: true },
    );
    const suffix = moduleRef.get(ConfigService).get<string>('PUBSUB_SUBSCRIPTION_SUFFIX', '');
    const push = (event: BootEvent): Promise<void> =>
      moduleRef
        .get<IPushableEventBus>(PUSHABLE_EVENT_BUS)
        .dispatchPushMessage(
          `projects/ikaro-local/subscriptions/ikaro-${BootEvent.name}-boot-consumer${suffix}`,
          Buffer.from(JSON.stringify(event)).toString('base64'),
        );

    await expect(push(new BootEvent(suspended))).resolves.toBeUndefined();
    await push(new BootEvent(operational));

    expect(delivered).toEqual([operational]);
  });
});
