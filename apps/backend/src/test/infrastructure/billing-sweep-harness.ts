import { SweepSubscriptionStatusesJob } from '../../contexts/billing/application/jobs/sweep-subscription-statuses.job';
import { ApplyChargeFactService } from '../../contexts/billing/application/services/apply-charge-fact.service';
import { ProviderChargeCreationService } from '../../contexts/billing/application/services/provider-charge-creation.service';
import { RecoveryChargePlanner } from '../../contexts/billing/application/services/recovery-charge-planner.service';
import { SubscriptionSweepRules } from '../../contexts/billing/application/services/subscription-sweep-rules.service';
import { ProviderChargeCancellationService } from '../../contexts/billing/application/services/provider-charge-cancellation.service';
import { SweepOneSubscriptionUseCase } from '../../contexts/billing/application/use-cases/sweep-one-subscription.use-case';
import type { Charge } from '../../contexts/billing/domain/charge.aggregate';
import { providerOfMerchantProfileKey } from '../../contexts/billing/domain/merchant-profile-key';
import type { Subscription } from '../../contexts/billing/domain/subscription.aggregate';
import { BillingProviderRegistry } from '../../contexts/billing/infrastructure/providers/billing-provider.registry';
import { FakeBillingProvider } from '../../contexts/billing/infrastructure/providers/fake-billing.provider';
import {
  BillingAccountBuilder,
  ChargeBuilder,
  FeaturePriceBuilder,
  FeaturePriceVersionBuilder,
  SubscriptionItemBuilder,
} from '../builders/billing';
import { AddressBuilder } from '../builders/shared';
import { addDaysUTC, utcDateString } from '../../shared/utils/calendar-date';
import { InMemoryBillingAccountRepository } from '../repositories/billing/in-memory-billing-account.repository';
import { InMemoryChargeRepository } from '../repositories/billing/in-memory-charge.repository';
import { InMemoryFeaturePriceRepository } from '../repositories/billing/in-memory-feature-price.repository';
import { InMemoryProviderEventRepository } from '../repositories/billing/in-memory-provider-event.repository';
import { InMemoryProviderHealthRepository } from '../repositories/billing/in-memory-provider-health.repository';
import { InMemorySubscriptionRepository } from '../repositories/billing/in-memory-subscription.repository';
import { AdvanceableClock } from './advanceable-clock';
import { InMemoryApplicationConfig } from './in-memory-application-config';
import { InMemoryBillingPlatformPort } from './in-memory-billing-platform.port';
import { InMemoryOutboxPublisher } from './in-memory-outbox-publisher';
import { InMemoryTransactionManager } from './in-memory-transaction-manager';

// São Paulo is UTC-3 with no DST: this instant is 12:00 local on 2026-03-10.
export const SWEEP_NOW = new Date('2026-03-10T15:00:00Z');

export interface SeedChargeOptions {
  kind?: 'PERIOD' | 'RECOVERY';
  /** The period the charge pays for; ignored by a recovery charge. */
  period?: [string, string];
  dueDate: string;
  status?: 'PENDING' | 'OVERDUE' | 'CANCELED' | 'REFUNDED' | 'CHARGEBACK';
  /** `false` leaves it without a payment link: its provider creation is still `PENDING`. */
  ready?: boolean;
  paymentReturnSeenAt?: Date;
  /** When the stored link stops being usable; `null` is a link the provider gave no expiry for. */
  paymentUrlExpiresAt?: Date | null;
}

/**
 * The in-memory wiring of the status sweep (UC-115): the fake provider behind the real registry,
 * in-memory repositories sharing one outbox, and the real creation service, rules, use cases and job
 * on top. `seedTenant` stores a subscription with a billable account and the Platform fact;
 * `seedCharge` stores a charge and, by default, makes it payable at the fake provider, so a spec
 * states only what it varies.
 */
export function createSweepHarness() {
  const clock = new AdvanceableClock(SWEEP_NOW);
  const txManager = new InMemoryTransactionManager();
  const outbox = new InMemoryOutboxPublisher(txManager);
  const provider = new FakeBillingProvider(clock);
  const registry = new BillingProviderRegistry('local', provider);
  const subscriptions = new InMemorySubscriptionRepository(outbox);
  const accounts = new InMemoryBillingAccountRepository();
  const charges = new InMemoryChargeRepository(outbox);
  const prices = new InMemoryFeaturePriceRepository();
  const providerEvents = new InMemoryProviderEventRepository();
  const health = new InMemoryProviderHealthRepository();
  const platform = new InMemoryBillingPlatformPort();
  const config = new InMemoryApplicationConfig({ FRONTEND_URL: 'https://app.ikaro.test' });
  const creation = new ProviderChargeCreationService(
    registry,
    accounts,
    subscriptions,
    charges,
    platform,
    config,
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

  // HOTSITE STANDARD at R$ 49,00 since the start of the year (the recovery charge's one line).
  prices.seed(
    new FeaturePriceBuilder()
      .withVersions([
        new FeaturePriceVersionBuilder()
          .withAmountMinor(4900)
          .withEffectiveFrom('2026-01-01')
          .build(),
      ])
      .build(),
  );

  async function seedTenant(
    subscription: Subscription,
    options: { billable?: boolean; active?: boolean } = {},
  ): Promise<void> {
    await subscriptions.save(subscription);
    const account = new BillingAccountBuilder().withTenantId(subscription.tenantId);
    if (options.billable !== false) {
      account.withTaxId('11144477735', 'CPF').withAddress(new AddressBuilder().build());
    }
    await accounts.save(account.build());
    platform.seed({
      tenantId: subscription.tenantId,
      slug: `tenant-${subscription.tenantId.slice(-6)}`,
      countryCode: 'BR',
      timezone: 'America/Sao_Paulo',
      createdAt: SWEEP_NOW,
      isActive: options.active !== false,
    });
  }

  // The fake refuses a past due date, as Asaas does, so a charge that is already overdue could never
  // have been created today. The provider side is created with a due date a week ahead and the local
  // charge, which keeps its own (past) due date, is bound to it: the state the sweep finds in real
  // life, a charge created while it was still due.
  async function createAtProvider(subscription: Subscription, local: Charge): Promise<string> {
    const { providerCustomerId } = await provider.ensureCustomer(subscription.tenantId, {
      name: 'Lava Rápido',
      email: 'billing@example.test',
      taxId: '11144477735',
      countryCode: 'BR',
    });
    const created = await provider.createCharge({
      merchantProfileKey: subscription.merchantProfileKey,
      providerCustomerId,
      dueDate: addDaysUTC(utcDateString(SWEEP_NOW), 7),
      lines: local.lines.map((line) => ({
        description: `${line.featureKey} ${line.tier}`,
        amountMinor: line.unitPriceMinor,
      })),
      currency: local.amount.currency,
      taxBehavior: 'INCLUSIVE',
      customerLocation: { countryCode: 'BR' },
      description: 'sweep seed',
      externalReference: local.id,
      returnUrl: 'https://app.ikaro.test/dashboard/billing',
    });
    return created.providerChargeId;
  }

  /** A charge of the subscription; by default payable at the fake provider (it has a link). */
  async function seedCharge(subscription: Subscription, options: SeedChargeOptions) {
    const builder = new ChargeBuilder()
      .withTenantId(subscription.tenantId)
      .withSubscriptionId(subscription.id)
      .withDueDate(options.dueDate);
    if (options.kind === 'RECOVERY') builder.asRecovery();
    else if (options.period) builder.withPeriod(options.period[0], options.period[1]);
    if (options.paymentReturnSeenAt) builder.withPaymentReturnSeenAt(options.paymentReturnSeenAt);
    if (options.status !== undefined && options.status !== 'PENDING') {
      builder.withStatus(options.status);
    }
    if (options.paymentUrlExpiresAt !== undefined) {
      builder.withPaymentUrlExpiresAt(options.paymentUrlExpiresAt);
    }
    if (options.ready !== false) {
      builder.withProviderReady(
        providerOfMerchantProfileKey(subscription.merchantProfileKey),
        await createAtProvider(subscription, builder.build()),
      );
    }
    const charge = builder.build();
    await charges.save(charge);
    outbox.published.length = 0;
    return charge;
  }

  /** One open-ended HOTSITE item, started before any date a spec uses. */
  const hotsiteItem = () =>
    new SubscriptionItemBuilder().withStartsAt(new Date('2026-01-01T03:00:00Z')).build();

  return {
    clock,
    txManager,
    outbox,
    provider,
    subscriptions,
    accounts,
    charges,
    prices,
    providerEvents,
    health,
    platform,
    creation,
    applyFact,
    cancellation,
    sweepOne,
    sweep,
    seedTenant,
    seedCharge,
    hotsiteItem,
  };
}
