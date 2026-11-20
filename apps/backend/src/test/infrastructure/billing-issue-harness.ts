import { countrySpec } from '@ikaro/i18n';
import { Address } from '../../shared/value-objects/address';
import { IssueChargeForSubscriptionUseCase } from '../../contexts/billing/application/use-cases/issue-charge-for-subscription.use-case';
import { IssueNextChargesJob } from '../../contexts/billing/application/jobs/issue-next-charges.job';
import { RetryPendingChargeCreationUseCase } from '../../contexts/billing/application/use-cases/retry-pending-charge-creation.use-case';
import { ProviderChargeCreationService } from '../../contexts/billing/application/services/provider-charge-creation.service';
import type { BillingProvisioningConfig } from '../../contexts/billing/application/ports/billing-provisioning-config.port';
import type { Subscription } from '../../contexts/billing/domain/subscription.aggregate';
import { BillingProviderRegistry } from '../../contexts/billing/infrastructure/providers/billing-provider.registry';
import { FakeBillingProvider } from '../../contexts/billing/infrastructure/providers/fake-billing.provider';
import {
  BillingAccountBuilder,
  FeaturePriceBuilder,
  FeaturePriceVersionBuilder,
  SubscriptionItemBuilder,
} from '../builders/billing';
import { InMemoryBillingAccountRepository } from '../repositories/billing/in-memory-billing-account.repository';
import { InMemoryChargeRepository } from '../repositories/billing/in-memory-charge.repository';
import { InMemoryFeaturePriceRepository } from '../repositories/billing/in-memory-feature-price.repository';
import { InMemorySubscriptionRepository } from '../repositories/billing/in-memory-subscription.repository';
import { AdvanceableClock } from './advanceable-clock';
import { InMemoryBillingPlatformPort } from './in-memory-billing-platform.port';
import { InMemoryOutboxPublisher } from './in-memory-outbox-publisher';
import { InMemoryTransactionManager } from './in-memory-transaction-manager';

// São Paulo is UTC-3 with no DST: this instant is 12:00 local on 2026-03-10.
export const ISSUE_NOW = new Date('2026-03-10T15:00:00Z');
export const ISSUE_FRONTEND_URL = 'https://app.ikaro.test';

/**
 * The in-memory wiring of the charge issue job (UC-113): the fake provider behind the real registry,
 * in-memory repositories sharing one outbox, and the real creation service and use cases on top.
 * `seedTenant` stores an `ACTIVE` subscription (one HOTSITE item), its billable account and the
 * Platform fact, so a spec states only what it varies.
 */
export function createIssueHarness() {
  const clock = new AdvanceableClock(ISSUE_NOW);
  const txManager = new InMemoryTransactionManager();
  const outbox = new InMemoryOutboxPublisher(txManager);
  const provider = new FakeBillingProvider(clock);
  const subscriptions = new InMemorySubscriptionRepository(outbox);
  const accounts = new InMemoryBillingAccountRepository();
  const charges = new InMemoryChargeRepository(outbox);
  const prices = new InMemoryFeaturePriceRepository();
  const platform = new InMemoryBillingPlatformPort();
  const config: BillingProvisioningConfig = {
    appEnv: 'local',
    platformOwnerSlug: null,
    frontendUrl: ISSUE_FRONTEND_URL,
  };
  const creation = new ProviderChargeCreationService(
    new BillingProviderRegistry('local', provider),
    accounts,
    subscriptions,
    charges,
    platform,
    config,
    txManager,
    clock,
  );
  const issueOne = new IssueChargeForSubscriptionUseCase(
    subscriptions,
    accounts,
    charges,
    prices,
    platform,
    txManager,
    clock,
    creation,
  );
  const retry = new RetryPendingChargeCreationUseCase(charges, clock, creation);
  const issueNext = new IssueNextChargesJob(subscriptions, clock, issueOne, retry);

  const address = Address.create(
    {
      street: 'Rua das Flores',
      number: '100',
      neighborhood: 'Centro',
      city: 'Belo Horizonte',
      state: 'MG',
      zipCode: '30130-110',
    },
    countrySpec('BR').address,
  );

  // HOTSITE STANDARD at R$ 49,00 since the start of the year.
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
    if (options.billable !== false) account.withTaxId('11144477735', 'CPF').withAddress(address);
    await accounts.save(account.build());
    platform.seed({
      tenantId: subscription.tenantId,
      slug: `tenant-${subscription.tenantId.slice(-6)}`,
      countryCode: 'BR',
      timezone: 'America/Sao_Paulo',
      createdAt: ISSUE_NOW,
      isActive: options.active !== false,
    });
  }

  /** One open-ended HOTSITE item, started before any date a spec uses. */
  const hotsiteItem = () =>
    new SubscriptionItemBuilder().withStartsAt(new Date('2026-01-01T03:00:00Z')).build();

  return {
    clock,
    outbox,
    provider,
    subscriptions,
    accounts,
    charges,
    prices,
    platform,
    issueOne,
    retry,
    issueNext,
    seedTenant,
    hotsiteItem,
  };
}
