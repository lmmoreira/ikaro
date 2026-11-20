import { DataSource } from 'typeorm';
import { SweepSubscriptionStatusesJob } from '../../contexts/billing/application/jobs/sweep-subscription-statuses.job';
import { ApplyChargeFactService } from '../../contexts/billing/application/services/apply-charge-fact.service';
import { ProviderChargeCreationService } from '../../contexts/billing/application/services/provider-charge-creation.service';
import { RecoveryChargePlanner } from '../../contexts/billing/application/services/recovery-charge-planner.service';
import { SubscriptionSweepRules } from '../../contexts/billing/application/services/subscription-sweep-rules.service';
import { ProviderChargeCancellationService } from '../../contexts/billing/application/services/provider-charge-cancellation.service';
import { RetryPendingChargeCreationUseCase } from '../../contexts/billing/application/use-cases/retry-pending-charge-creation.use-case';
import { SweepOneSubscriptionUseCase } from '../../contexts/billing/application/use-cases/sweep-one-subscription.use-case';
import { providerOfMerchantProfileKey } from '../../contexts/billing/domain/merchant-profile-key';
import { BillingAccountEntity } from '../../contexts/billing/infrastructure/entities/billing-account.entity';
import { ChargeEntity } from '../../contexts/billing/infrastructure/entities/charge.entity';
import { FeaturePriceVersionEntity } from '../../contexts/billing/infrastructure/entities/feature-price-version.entity';
import { FeaturePriceEntity } from '../../contexts/billing/infrastructure/entities/feature-price.entity';
import { ProviderEventEntity } from '../../contexts/billing/infrastructure/entities/provider-event.entity';
import { ProviderHealthEntity } from '../../contexts/billing/infrastructure/entities/provider-health.entity';
import { SubscriptionItemEntity } from '../../contexts/billing/infrastructure/entities/subscription-item.entity';
import { SubscriptionEntity } from '../../contexts/billing/infrastructure/entities/subscription.entity';
import { BillingProviderRegistry } from '../../contexts/billing/infrastructure/providers/billing-provider.registry';
import { FakeBillingProvider } from '../../contexts/billing/infrastructure/providers/fake-billing.provider';
import { TypeOrmBillingAccountRepository } from '../../contexts/billing/infrastructure/repositories/typeorm-billing-account.repository';
import { TypeOrmChargeRepository } from '../../contexts/billing/infrastructure/repositories/typeorm-charge.repository';
import { TypeOrmFeaturePriceRepository } from '../../contexts/billing/infrastructure/repositories/typeorm-feature-price.repository';
import { TypeOrmProviderEventRepository } from '../../contexts/billing/infrastructure/repositories/typeorm-provider-event.repository';
import { TypeOrmProviderHealthRepository } from '../../contexts/billing/infrastructure/repositories/typeorm-provider-health.repository';
import { TypeOrmSubscriptionRepository } from '../../contexts/billing/infrastructure/repositories/typeorm-subscription.repository';
import { uuidv7 } from '../../shared/domain/uuid-v7';
import { SystemClock } from '../../shared/infrastructure/clock/system-clock.adapter';
import { TypeOrmTransactionManager } from '../../shared/infrastructure/typeorm-transaction-manager';
import { addDaysUTC, todayUTC } from '../../shared/utils/calendar-date';
import {
  BillingAccountBuilder,
  ChargeBuilder,
  ProviderHealthEntityBuilder,
  SubscriptionEntityBuilder,
  SubscriptionItemEntityBuilder,
} from '../builders/billing';
import { AddressBuilder } from '../builders/shared';
import { InMemoryApplicationConfig } from '../infrastructure/in-memory-application-config';
import { InMemoryBillingPlatformPort } from '../infrastructure/in-memory-billing-platform.port';
import { InMemoryOutboxPublisher } from '../infrastructure/in-memory-outbox-publisher';
import { createTestDataSource } from '../test-datasource';

const DAY_MS = 24 * 60 * 60 * 1000;

/** A tenant the world seeded: its ids, for the specs to assert against. */
export interface SweepTenant {
  tenantId: string;
  subscriptionId: string;
}

export interface SeedSubscriptionOptions {
  /** Customizes the subscription row (status, instants, merchant profile key). */
  configure: (builder: SubscriptionEntityBuilder) => SubscriptionEntityBuilder;
  /** `false` leaves the billing identity incomplete (no tax id, no address): provider creation is held. */
  billable?: boolean;
}

export interface SeedChargeOptions {
  kind?: 'PERIOD' | 'RECOVERY';
  period?: [string, string];
  dueDate: string;
  status?: 'PENDING' | 'OVERDUE';
  /** `false` leaves no payment link: its provider creation is still `PENDING`. */
  ready?: boolean;
}

/**
 * The real repositories and row locks of the status sweep against Postgres, composed by hand (the
 * module's own DI wiring is exercised by the webhook controller's integration spec). The clock is
 * the real one, so every instant is relative to now; the fake provider sits behind the real
 * registry. The seeded BR price list prices HOTSITE STANDARD at R$ 49,00 from 2026-01-01.
 */
export async function createSweepWorld() {
  const ds: DataSource = await createTestDataSource();
  const txManager = new TypeOrmTransactionManager(ds);
  const outbox = new InMemoryOutboxPublisher();
  const clock = new SystemClock();
  const provider = new FakeBillingProvider(clock);
  const registry = new BillingProviderRegistry('local', provider);
  const subscriptions = new TypeOrmSubscriptionRepository(
    ds.getRepository(SubscriptionEntity),
    outbox,
  );
  const accounts = new TypeOrmBillingAccountRepository(ds.getRepository(BillingAccountEntity));
  const charges = new TypeOrmChargeRepository(ds.getRepository(ChargeEntity), outbox);
  const prices = new TypeOrmFeaturePriceRepository(
    ds.getRepository(FeaturePriceEntity),
    ds.getRepository(FeaturePriceVersionEntity),
  );
  const providerEvents = new TypeOrmProviderEventRepository(ds.getRepository(ProviderEventEntity));
  const health = new TypeOrmProviderHealthRepository(ds.getRepository(ProviderHealthEntity));
  const platform = new InMemoryBillingPlatformPort();
  const creation = new ProviderChargeCreationService(
    registry,
    accounts,
    subscriptions,
    charges,
    platform,
    new InMemoryApplicationConfig({ FRONTEND_URL: 'http://localhost:3000' }),
    txManager,
    clock,
  );
  const planner = new RecoveryChargePlanner(charges, prices);
  const applyFact = new ApplyChargeFactService(
    subscriptions,
    charges,
    providerEvents,
    planner,
    txManager,
    clock,
  );
  const cancellation = new ProviderChargeCancellationService(
    registry,
    subscriptions,
    accounts,
    charges,
    applyFact,
    txManager,
    clock,
  );
  const rules = new SubscriptionSweepRules(charges, planner);
  const sweepOne = new SweepOneSubscriptionUseCase(
    subscriptions,
    charges,
    accounts,
    registry,
    txManager,
    clock,
    rules,
    applyFact,
    cancellation,
    creation,
  );
  const sweep = new SweepSubscriptionStatusesJob(subscriptions, charges, health, clock, sweepOne);
  const retry = new RetryPendingChargeCreationUseCase(charges, clock, creation);
  const tenants: string[] = [];
  const healthKeys: string[] = [];

  async function seedSubscription(options: SeedSubscriptionOptions): Promise<SweepTenant> {
    const tenantId = uuidv7();
    tenants.push(tenantId);
    const subscription = options
      .configure(new SubscriptionEntityBuilder().withTenantId(tenantId))
      .build();
    await ds.getRepository(SubscriptionEntity).insert(subscription);
    await ds
      .getRepository(SubscriptionItemEntity)
      .insert(
        new SubscriptionItemEntityBuilder()
          .withTenantId(tenantId)
          .withSubscriptionId(subscription.id)
          .build(),
      );
    const account = new BillingAccountBuilder().withTenantId(tenantId);
    if (options.billable !== false) {
      account.withTaxId('11144477735', 'CPF').withAddress(new AddressBuilder().build());
    }
    await txManager.run(() => accounts.save(account.build()));
    platform.seed({
      tenantId,
      slug: `sw-${tenantId.slice(-8)}`,
      countryCode: 'BR',
      timezone: 'America/Sao_Paulo',
      createdAt: new Date(),
      isActive: true,
    });
    return { tenantId, subscriptionId: subscription.id };
  }

  // The fake refuses a past due date (as Asaas does), so the provider side is created with a due
  // date a week ahead and the local charge, which keeps its own, is bound to it: a charge created
  // while it was still due, found overdue later.
  async function createAtProvider(tenant: SweepTenant, local: ReturnType<ChargeBuilder['build']>) {
    const { providerCustomerId } = await provider.ensureCustomer(tenant.tenantId, {
      name: 'Lava Rápido',
      email: 'billing@example.test',
      taxId: '11144477735',
      countryCode: 'BR',
    });
    const created = await provider.createCharge({
      merchantProfileKey: 'BRL_FAKE',
      providerCustomerId,
      dueDate: addDaysUTC(todayUTC(), 7),
      lines: local.lines.map((line) => ({
        description: `${line.featureKey} ${line.tier}`,
        amountMinor: line.unitPriceMinor,
      })),
      currency: local.amount.currency,
      taxBehavior: 'INCLUSIVE',
      customerLocation: { countryCode: 'BR' },
      description: 'sweep seed',
      externalReference: local.id,
      returnUrl: 'http://localhost:3000/dashboard/billing',
    });
    return created.providerChargeId;
  }

  async function seedCharge(tenant: SweepTenant, options: SeedChargeOptions) {
    const builder = new ChargeBuilder()
      .withTenantId(tenant.tenantId)
      .withSubscriptionId(tenant.subscriptionId)
      .withDueDate(options.dueDate)
      .withVersion(undefined);
    if (options.kind === 'RECOVERY') builder.asRecovery();
    else
      builder.withPeriod(
        ...(options.period ?? [addDaysUTC(options.dueDate, -30), options.dueDate]),
      );
    if (options.status === 'OVERDUE') builder.withStatus('OVERDUE');
    if (options.ready !== false) {
      const providerChargeId = await createAtProvider(tenant, builder.build());
      builder.withProviderReady(providerOfMerchantProfileKey('BRL_FAKE'), providerChargeId);
    }
    const charge = builder.build();
    await charges.save(charge);
    return charge;
  }

  /** Saves a health row under a key no other suite uses; it is removed with the rest of the world's rows. */
  async function seedHealthKey(key: string, freezeSince: Date | null) {
    healthKeys.push(key);
    await ds
      .getRepository(ProviderHealthEntity)
      .insert(
        new ProviderHealthEntityBuilder()
          .withMerchantProfileKey(key)
          .withFreeze(freezeSince)
          .build(),
      );
  }

  const chargeRows = (tenantId: string) =>
    ds.getRepository(ChargeEntity).find({ where: { tenantId } });
  const subscriptionRow = (tenantId: string) =>
    ds.getRepository(SubscriptionEntity).findOneByOrFail({ tenantId });

  async function cleanup(): Promise<void> {
    if (tenants.length > 0) {
      for (const table of [
        'charge_lines',
        'charges',
        'provider_events',
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
    if (healthKeys.length > 0) {
      await ds.query(
        `DELETE FROM "billing"."provider_health" WHERE "merchant_profile_key" = ANY($1::text[])`,
        [healthKeys],
      );
      healthKeys.length = 0;
    }
  }

  return {
    ds,
    txManager,
    outbox,
    provider,
    subscriptions,
    accounts,
    charges,
    health,
    creation,
    cancellation,
    applyFact,
    sweepOne,
    sweep,
    retry,
    seedSubscription,
    seedCharge,
    seedHealthKey,
    chargeRows,
    subscriptionRow,
    cleanup,
    destroy: () => ds.destroy(),
    daysAgo: (days: number): Date => new Date(Date.now() - days * DAY_MS),
  };
}

export type SweepWorld = Awaited<ReturnType<typeof createSweepWorld>>;
