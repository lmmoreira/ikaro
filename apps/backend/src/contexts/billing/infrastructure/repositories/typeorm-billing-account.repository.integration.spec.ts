import { DataSource, QueryFailedError } from 'typeorm';
import { uuidv7 } from '../../../../shared/domain/uuid-v7';
import { TypeOrmTransactionManager } from '../../../../shared/infrastructure/typeorm-transaction-manager';
import { Address } from '../../../../shared/value-objects/address';
import { CountryCode } from '../../../../shared/value-objects/country-code.vo';
import { Email } from '../../../../shared/value-objects/email.vo';
import { BillingAccountBuilder } from '../../../../test/builders/billing';
import { createTestDataSource } from '../../../../test/test-datasource';
import { BillingAccount } from '../../domain/billing-account.aggregate';
import {
  BillingAccountAlreadyExistsError,
  BillingAccountSubscriptionMissingError,
} from '../../domain/errors/billing-domain.error';
import { Subscription } from '../../domain/subscription.aggregate';
import { BillingAccountEntity } from '../entities/billing-account.entity';
import { SubscriptionEntity } from '../entities/subscription.entity';
import { TypeOrmBillingAccountRepository } from './typeorm-billing-account.repository';
import { TypeOrmSubscriptionRepository } from './typeorm-subscription.repository';

describe('TypeOrmBillingAccountRepository (integration)', () => {
  let dataSource: DataSource;
  let txManager: TypeOrmTransactionManager;
  let accounts: TypeOrmBillingAccountRepository;
  let subscriptions: TypeOrmSubscriptionRepository;
  // A fresh tenant per scenario; the rows are deleted (items first: the composite FK) after each test.
  const tenants: string[] = [];

  const newTenant = (): string => {
    const tenantId = uuidv7();
    tenants.push(tenantId);
    return tenantId;
  };

  const startSubscription = async (tenantId: string, country: 'BR' | 'US'): Promise<void> => {
    const subscription = Subscription.startExempt({
      tenantId,
      countryCode: CountryCode.create(country),
      currency: country === 'BR' ? 'BRL' : 'USD',
      timezone: country === 'BR' ? 'America/Sao_Paulo' : 'America/New_York',
      merchantProfileKey: country === 'BR' ? 'BRL_FAKE' : 'USD_FAKE',
      start: new Date('2026-01-10T15:00:00Z'),
    });
    await txManager.run(() => subscriptions.save(subscription));
  };

  const save = (account: BillingAccount): Promise<void> =>
    txManager.run(() => accounts.save(account));

  beforeAll(async () => {
    dataSource = await createTestDataSource();
    txManager = new TypeOrmTransactionManager(dataSource);
    accounts = new TypeOrmBillingAccountRepository(dataSource.getRepository(BillingAccountEntity));
    subscriptions = new TypeOrmSubscriptionRepository(dataSource.getRepository(SubscriptionEntity));
  });

  afterEach(async () => {
    if (tenants.length > 0) {
      await dataSource.query(
        `DELETE FROM "billing"."billing_accounts" WHERE "tenant_id" = ANY($1::uuid[])`,
        [tenants],
      );
      await dataSource.query(
        `DELETE FROM "billing"."subscription_items" WHERE "tenant_id" = ANY($1::uuid[])`,
        [tenants],
      );
      await dataSource.query(
        `DELETE FROM "billing"."subscriptions" WHERE "tenant_id" = ANY($1::uuid[])`,
        [tenants],
      );
      tenants.length = 0;
    }
  });

  afterAll(async () => {
    await dataSource.destroy();
  });

  it('round-trips an account, taking its country from the tenant subscription', async () => {
    const tenantId = newTenant();
    await startSubscription(tenantId, 'BR');
    const created = BillingAccount.create({
      tenantId,
      countryCode: CountryCode.create('BR'),
      taxId: { raw: '529.982.247-25' },
      requireTaxId: true,
      legalName: 'Lava Rápido Ltda',
      billingEmail: Email.create('financeiro@example.com'),
      acceptedTerms: {
        version: '2026-11',
        acceptedAt: new Date('2026-11-10T12:00:00Z'),
        acceptedBy: 'gerente@example.com',
      },
    });

    await save(created);
    const found = await accounts.findByTenantId(tenantId);

    expect(found?.id).toBe(created.id);
    expect(found?.countryCode.value).toBe('BR');
    expect(found?.taxId?.type).toBe('CPF');
    expect(found?.taxId?.value).toBe('52998224725');
    expect(found?.legalName).toBe('Lava Rápido Ltda');
    expect(found?.billingEmail?.address).toBe('financeiro@example.com');
    expect(found?.autoBilling).toBe('NONE');
    expect(found?.autoBillingStatus).toBe('INACTIVE');
    expect(found?.acceptedTerms?.version).toBe('2026-11');
    expect(found?.acceptedTerms?.acceptedAt.toISOString()).toBe('2026-11-10T12:00:00.000Z');
    expect(found?.acceptedTerms?.acceptedBy).toBe('gerente@example.com');
  });

  it('hydrates the country of a US tenant from its subscription (the account has no country column)', async () => {
    const tenantId = newTenant();
    await startSubscription(tenantId, 'US');
    await save(
      BillingAccount.create({
        tenantId,
        countryCode: CountryCode.create('US'),
        taxId: null,
        requireTaxId: true,
      }),
    );

    const found = await accounts.findByTenantId(tenantId);

    expect(found?.countryCode.value).toBe('US');
    expect(found?.taxId).toBeNull();
  });

  it('loads an exempt shell with no tax id, terms or address', async () => {
    const tenantId = newTenant();
    await startSubscription(tenantId, 'BR');
    await save(new BillingAccountBuilder().withTenantId(tenantId).build());

    const found = await accounts.findByTenantId(tenantId);

    expect(found?.taxId).toBeNull();
    expect(found?.acceptedTerms).toBeNull();
    expect(found?.address).toBeNull();
  });

  it('upserts by id: a second save of the same account updates it in place', async () => {
    const tenantId = newTenant();
    await startSubscription(tenantId, 'BR');
    const shell = new BillingAccountBuilder().withTenantId(tenantId).build();
    await save(shell);

    await save(
      new BillingAccountBuilder()
        .withId(shell.id)
        .withTenantId(tenantId)
        .withLegalName('Nome Atualizado')
        .withProvider('ASAAS', 'cus_000123')
        .withAddress(
          Address.reconstitute({
            street: 'Rua A',
            number: '10',
            city: 'São Paulo',
            state: 'SP',
            zipCode: '01310-100',
          }),
        )
        .build(),
    );

    const found = await accounts.findByTenantId(tenantId);
    expect(found?.id).toBe(shell.id);
    expect(found?.legalName).toBe('Nome Atualizado');
    expect(found?.provider).toBe('ASAAS');
    expect(found?.providerCustomerId).toBe('cus_000123');
    expect(found?.address?.city).toBe('São Paulo');
    expect(await dataSource.getRepository(BillingAccountEntity).countBy({ tenantId })).toBe(1);
  });

  it('UNIQUE(tenant_id) refuses a second account for one tenant', async () => {
    const tenantId = newTenant();
    await startSubscription(tenantId, 'BR');
    await save(new BillingAccountBuilder().withTenantId(tenantId).build());

    await expect(save(new BillingAccountBuilder().withTenantId(tenantId).build())).rejects.toThrow(
      BillingAccountAlreadyExistsError,
    );
  });

  it("never lets a save for one tenant touch another tenant's account, even with that account's id", async () => {
    const tenantA = newTenant();
    const tenantB = newTenant();
    await startSubscription(tenantA, 'BR');
    await startSubscription(tenantB, 'BR');
    const accountA = new BillingAccountBuilder()
      .withTenantId(tenantA)
      .withLegalName('Empresa A')
      .build();
    await save(accountA);

    // Tenant B's aggregate carrying tenant A's account id: the tenant predicate on the write finds
    // no row to update, and the insert then fails on the primary key.
    const forgery = new BillingAccountBuilder()
      .withId(accountA.id)
      .withTenantId(tenantB)
      .withLegalName('Invasor')
      .build();
    await expect(save(forgery)).rejects.toBeInstanceOf(QueryFailedError);

    const found = await accounts.findByTenantId(tenantA);
    expect(found?.legalName).toBe('Empresa A');
    expect(await accounts.findByTenantId(tenantB)).toBeNull();
  });

  it('fails loudly when the tenant has an account but no subscription', async () => {
    const tenantId = newTenant();
    await save(new BillingAccountBuilder().withTenantId(tenantId).build());

    await expect(accounts.findByTenantId(tenantId)).rejects.toThrow(
      BillingAccountSubscriptionMissingError,
    );
  });

  it("never returns another tenant's account", async () => {
    const tenantA = newTenant();
    const tenantB = newTenant();
    await startSubscription(tenantA, 'BR');
    await startSubscription(tenantB, 'BR');
    await save(new BillingAccountBuilder().withTenantId(tenantA).withLegalName('A').build());

    expect(await accounts.findByTenantId(tenantB)).toBeNull();
  });
});
