import {
  BillingAccountBuilder,
  ChargeBuilder,
  SubscriptionBuilder,
} from '../../../../test/builders/billing';
import { AddressBuilder } from '../../../../test/builders/shared';
import { AdvanceableClock } from '../../../../test/infrastructure/advanceable-clock';
import { InMemoryBillingPlatformPort } from '../../../../test/infrastructure/in-memory-billing-platform.port';
import { InMemoryOutboxPublisher } from '../../../../test/infrastructure/in-memory-outbox-publisher';
import { InMemoryTransactionManager } from '../../../../test/infrastructure/in-memory-transaction-manager';
import { InMemoryBillingAccountRepository } from '../../../../test/repositories/billing/in-memory-billing-account.repository';
import { InMemoryChargeRepository } from '../../../../test/repositories/billing/in-memory-charge.repository';
import { InMemorySubscriptionRepository } from '../../../../test/repositories/billing/in-memory-subscription.repository';
import type { BillingAccount } from '../../domain/billing-account.aggregate';
import type { Charge } from '../../domain/charge.aggregate';
import { PROVIDER_CREATION_LEASE_MINUTES } from '../../domain/billing-constants';
import { BillingProviderRegistry } from '../../infrastructure/providers/billing-provider.registry';
import { FakeBillingProvider } from '../../infrastructure/providers/fake-billing.provider';
import type {
  CreateProviderChargeInput,
  CreatedProviderCharge,
  ProviderCustomerIdentity,
} from '../ports/billing-provider.port';
import type { BillingProvisioningConfig } from '../ports/billing-provisioning-config.port';
import { ProviderChargeCreationService } from './provider-charge-creation.service';

const NOW = new Date('2026-03-10T15:00:00Z');
const CORRELATION_ID = 'corr-1';
const FRONTEND_URL = 'https://app.ikaro.test';

// Records what reaches the provider; `beforeCreate` lets a spec play the webhook that lands
// between the provider call and the READY write.
class RecordingProvider extends FakeBillingProvider {
  readonly customers: ProviderCustomerIdentity[] = [];
  readonly inputs: CreateProviderChargeInput[] = [];
  beforeCreate: (() => Promise<void>) | null = null;

  override async ensureCustomer(tenantId: string, identity: ProviderCustomerIdentity) {
    this.customers.push(identity);
    return super.ensureCustomer(tenantId, identity);
  }

  override async createCharge(input: CreateProviderChargeInput): Promise<CreatedProviderCharge> {
    this.inputs.push(input);
    const created = await super.createCharge(input);
    await this.beforeCreate?.();
    return created;
  }
}

describe('ProviderChargeCreationService', () => {
  let clock: AdvanceableClock;
  let outbox: InMemoryOutboxPublisher;
  let provider: RecordingProvider;
  let subscriptions: InMemorySubscriptionRepository;
  let accounts: InMemoryBillingAccountRepository;
  let charges: InMemoryChargeRepository;
  let platform: InMemoryBillingPlatformPort;
  let service: ProviderChargeCreationService;
  let tenantId: string;
  let charge: Charge;

  const seedAccount = async (
    build: (b: BillingAccountBuilder) => BillingAccountBuilder = (b) => b,
  ) => {
    const account: BillingAccount = build(
      new BillingAccountBuilder()
        .withTenantId(tenantId)
        .withTaxId('11144477735', 'CPF')
        .withAddress(new AddressBuilder().build()),
    ).build();
    await accounts.save(account);
    return account;
  };

  beforeEach(async () => {
    clock = new AdvanceableClock(NOW);
    const txManager = new InMemoryTransactionManager();
    outbox = new InMemoryOutboxPublisher(txManager);
    provider = new RecordingProvider(clock);
    subscriptions = new InMemorySubscriptionRepository(outbox);
    accounts = new InMemoryBillingAccountRepository();
    charges = new InMemoryChargeRepository(outbox);
    platform = new InMemoryBillingPlatformPort();
    const config: BillingProvisioningConfig = {
      appEnv: 'local',
      platformOwnerSlug: null,
      frontendUrl: FRONTEND_URL,
    };
    service = new ProviderChargeCreationService(
      new BillingProviderRegistry('local', provider),
      accounts,
      subscriptions,
      charges,
      platform,
      config,
      txManager,
      clock,
    );

    const subscription = new SubscriptionBuilder().withStatus('ACTIVE').build();
    tenantId = subscription.tenantId;
    await subscriptions.save(subscription);
    charge = new ChargeBuilder().withTenantId(tenantId).withSubscriptionId(subscription.id).build();
    await charges.save(charge);
    platform.seed({
      tenantId,
      slug: 'lavacar-bh',
      countryCode: 'BR',
      timezone: 'America/Sao_Paulo',
      createdAt: NOW,
      isActive: true,
    });
    outbox.published.length = 0;
  });

  const run = () =>
    service.execute({ tenantId, chargeId: charge.id, correlationId: CORRELATION_ID });

  it('makes the charge payable at the provider and announces it once, after READY', async () => {
    await seedAccount((b) =>
      b.withLegalName('Lava Car BH Ltda').withBillingEmail('billing@lavacar.test'),
    );

    await expect(run()).resolves.toBe('READY');

    const stored = await charges.findById(tenantId, charge.id);
    expect(stored?.providerCreationStatus).toBe('READY');
    expect(stored?.provider).toBe('ASAAS');
    expect(stored?.providerChargeId).not.toBeNull();
    expect(stored?.paymentUrl).not.toBeNull();
    const issued = outbox.published.filter((e) => e.eventName === 'ChargeIssued');
    expect(issued).toHaveLength(1);
    expect(issued[0]).toMatchObject({
      tenantId,
      correlationId: CORRELATION_ID,
      data: { chargeId: charge.id, recipientEmail: 'billing@lavacar.test' },
    });
  });

  it('syncs the identity, saves the provider customer, and sends our charge id and the return URL', async () => {
    const account = await seedAccount((b) =>
      b.withLegalName('Lava Car BH Ltda').withBillingEmail('billing@lavacar.test'),
    );

    await run();

    expect(provider.customers).toEqual([
      {
        name: 'Lava Car BH Ltda',
        email: 'billing@lavacar.test',
        taxId: '11144477735',
        countryCode: 'BR',
      },
    ]);
    expect(account.providerCustomerId).not.toBeNull();
    expect(account.provider).toBe('ASAAS');
    expect(provider.inputs).toHaveLength(1);
    expect(provider.inputs[0]).toMatchObject({
      externalReference: charge.id,
      dueDate: charge.dueDate.value,
      taxBehavior: 'INCLUSIVE',
      customerLocation: { countryCode: 'BR', postalCode: '30130-110', state: 'MG' },
      returnUrl: `${FRONTEND_URL}/dashboard/billing?payment=return&charge=${charge.id}`,
    });
  });

  it('names the customer after the tenant slug and sends no email when the account holds neither', async () => {
    await seedAccount();

    await run();

    expect(provider.customers[0]).toMatchObject({ name: 'lavacar-bh', email: null });
  });

  it('HELD: with no billable identity it makes no provider call and counts no attempt', async () => {
    await accounts.save(new BillingAccountBuilder().withTenantId(tenantId).build());

    await expect(run()).resolves.toBe('HELD');

    expect(provider.customers).toHaveLength(0);
    expect(provider.inputs).toHaveLength(0);
    expect((await charges.findById(tenantId, charge.id))?.providerCreationStatus).toBe('PENDING');
    expect(await charges.claimForProviderCreation(tenantId, charge.id, clock.now())).toBe(true);
  });

  it('PROVIDER_UNSUPPORTED: a profile with no adapter yet is skipped without claiming', async () => {
    const other = new SubscriptionBuilder()
      .withStatus('ACTIVE')
      .withMerchantProfileKey('USD_FAKE')
      .build();
    await subscriptions.save(other);
    platform.seed({
      tenantId: other.tenantId,
      slug: 'tenant-us',
      countryCode: 'US',
      timezone: 'America/New_York',
      createdAt: NOW,
      isActive: true,
    });
    const usCharge = new ChargeBuilder()
      .withTenantId(other.tenantId)
      .withSubscriptionId(other.id)
      .build();
    await charges.save(usCharge);

    await expect(
      service.execute({
        tenantId: other.tenantId,
        chargeId: usCharge.id,
        correlationId: CORRELATION_ID,
      }),
    ).resolves.toBe('PROVIDER_UNSUPPORTED');

    expect(provider.customers).toHaveLength(0);
    expect(await charges.claimForProviderCreation(other.tenantId, usCharge.id, clock.now())).toBe(
      true,
    );
  });

  it('PROVIDER_FAILED: a provider failure leaves the charge PENDING, announces nothing, and the retry creates it', async () => {
    await seedAccount();
    provider.failNextCall('UNAVAILABLE');

    await expect(run()).resolves.toBe('PROVIDER_FAILED');

    expect((await charges.findById(tenantId, charge.id))?.providerCreationStatus).toBe('PENDING');
    expect(outbox.published).toHaveLength(0);

    // The lease holds the charge for the creator that failed; once it is free the retry wins.
    expect(await run()).toBe('NOT_CLAIMED');
    clock.advanceMs(PROVIDER_CREATION_LEASE_MINUTES * 60_000 + 1);
    await expect(run()).resolves.toBe('READY');
    expect(provider.charges.size).toBe(1);
  });

  it('NOT_CLAIMED: a creator that does not win the lease makes no provider call', async () => {
    await seedAccount();
    await charges.claimForProviderCreation(tenantId, charge.id, clock.now());

    await expect(run()).resolves.toBe('NOT_CLAIMED');

    expect(provider.inputs).toHaveLength(0);
  });

  it('two concurrent creators produce exactly one provider charge and one ChargeIssued', async () => {
    await seedAccount();

    const results = await Promise.all([run(), run()]);

    expect([...results].sort()).toEqual(['NOT_CLAIMED', 'READY']);
    expect(provider.charges.size).toBe(1);
    expect(outbox.published.filter((e) => e.eventName === 'ChargeIssued')).toHaveLength(1);
  });

  it('keeps a PAID status a webhook wrote in between, stores the provider fields, and announces nothing', async () => {
    await seedAccount();
    provider.beforeCreate = async () => {
      const paid = await charges.findById(tenantId, charge.id);
      paid?.markPaid('PIX', NOW, null, 'webhook-corr', null);
      if (paid) await charges.save(paid);
    };

    await expect(run()).resolves.toBe('READY');

    const stored = await charges.findById(tenantId, charge.id);
    expect(stored?.status).toBe('PAID');
    expect(stored?.providerCreationStatus).toBe('READY');
    expect(stored?.providerChargeId).not.toBeNull();
    expect(outbox.published.filter((e) => e.eventName === 'ChargeIssued')).toHaveLength(0);
  });

  it.each(['PAID', 'CANCELED'] as const)(
    'NOT_PENDING: a %s charge is never created at the provider',
    async (status) => {
      await seedAccount();
      const closed = new ChargeBuilder()
        .withTenantId(tenantId)
        .withStatus(status)
        .withSubscriptionId(charge.subscriptionId)
        .withDueDate('2026-04-01')
        .withPeriod('2026-04-01', '2026-04-30')
        .build();
      await charges.save(closed);

      await expect(
        service.execute({ tenantId, chargeId: closed.id, correlationId: CORRELATION_ID }),
      ).resolves.toBe('NOT_PENDING');
      expect(provider.inputs).toHaveLength(0);
    },
  );

  it('EXEMPT: a charge left PENDING before the tenant became exempt is never sent to the provider', async () => {
    await seedAccount();
    const exempt = new SubscriptionBuilder().withStatus('ACTIVE').withExempt(true).build();
    await subscriptions.save(exempt);
    const orphan = new ChargeBuilder()
      .withTenantId(exempt.tenantId)
      .withSubscriptionId(exempt.id)
      .build();
    await charges.save(orphan);

    await expect(
      service.execute({
        tenantId: exempt.tenantId,
        chargeId: orphan.id,
        correlationId: CORRELATION_ID,
      }),
    ).resolves.toBe('EXEMPT');

    expect(provider.inputs).toHaveLength(0);
    expect(await charges.claimForProviderCreation(exempt.tenantId, orphan.id, clock.now())).toBe(
      true,
    );
  });

  it('TENANT_INACTIVE: a deactivated tenant is never sent to the provider, the retry path included', async () => {
    await seedAccount();
    platform.seed({
      tenantId,
      slug: 'lavacar-bh',
      countryCode: 'BR',
      timezone: 'America/Sao_Paulo',
      createdAt: NOW,
      isActive: false,
    });

    await expect(run()).resolves.toBe('TENANT_INACTIVE');

    expect(provider.inputs).toHaveLength(0);
  });

  it('A1: a tenant exempted while the provider call was in flight gets the charge cancelled, flagged for the cancel retry and announced to nobody', async () => {
    await seedAccount();
    provider.beforeCreate = async () => {
      const subscription = await subscriptions.findByTenantId(tenantId);
      subscription?.setExempt(NOW, 'operator', 'corr-exempt');
      if (subscription) await subscriptions.save(subscription);
    };

    await expect(run()).resolves.toBe('READY');

    const stored = await charges.findById(tenantId, charge.id);
    expect(stored?.status).toBe('CANCELED');
    expect(stored?.providerChargeId).not.toBeNull();
    expect(stored?.providerCancelPending).toBe(true);
    expect(outbox.published.filter((e) => e.eventName === 'ChargeIssued')).toHaveLength(0);
  });

  it('flags a charge cancelled while the provider call was in flight, so the cancel retry removes it', async () => {
    await seedAccount();
    provider.beforeCreate = async () => {
      const cancelled = await charges.findById(tenantId, charge.id);
      cancelled?.cancel();
      if (cancelled) await charges.save(cancelled);
    };

    await expect(run()).resolves.toBe('READY');

    const stored = await charges.findById(tenantId, charge.id);
    expect(stored?.status).toBe('CANCELED');
    expect(stored?.providerChargeId).not.toBeNull();
    expect(stored?.providerCancelPending).toBe(true);
    expect(outbox.published.filter((e) => e.eventName === 'ChargeIssued')).toHaveLength(0);
  });

  it('NOT_FOUND: another tenant cannot reach the charge', async () => {
    await seedAccount();

    await expect(
      service.execute({
        tenantId: 'another-tenant',
        chargeId: charge.id,
        correlationId: CORRELATION_ID,
      }),
    ).resolves.toBe('NOT_FOUND');
  });
});
