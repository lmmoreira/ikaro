import { countrySpec } from '@ikaro/i18n';
import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { uuidv7 } from '../../../../shared/domain/uuid-v7';
import {
  ITransactionManager,
  TRANSACTION_MANAGER,
} from '../../../../shared/ports/transaction-manager.port';
import { addDaysUTC, todayUTC } from '../../../../shared/utils/calendar-date';
import { Address } from '../../../../shared/value-objects/address';
import {
  BillingAccountBuilder,
  SubscriptionEntityBuilder,
  SubscriptionItemEntityBuilder,
} from '../../../../test/builders/billing';
import { InMemoryBillingPlatformPort } from '../../../../test/infrastructure/in-memory-billing-platform.port';
import { RoutingInMemoryEventBus } from '../../../../test/infrastructure/routing-in-memory-event-bus';
import { createBillingIntegrationApp } from '../../../../test/utils/billing-integration-app';
import { databaseNow, waitForBlockedLock } from '../../../../test/utils/booking-lock-race-world';
import { ChargeLineEntity } from '../../infrastructure/entities/charge-line.entity';
import { ChargeEntity } from '../../infrastructure/entities/charge.entity';
import { SubscriptionItemEntity } from '../../infrastructure/entities/subscription-item.entity';
import { SubscriptionEntity } from '../../infrastructure/entities/subscription.entity';
import { FakeBillingProvider } from '../../infrastructure/providers/fake-billing.provider';
import {
  BILLING_ACCOUNT_REPOSITORY,
  IBillingAccountRepository,
} from '../ports/billing-account-repository.port';
import { BILLING_PLATFORM_PORT } from '../ports/billing-platform.port';
import { CHARGE_REPOSITORY, IChargeRepository } from '../ports/charge-repository.port';
import {
  ISubscriptionRepository,
  SUBSCRIPTION_REPOSITORY,
} from '../ports/subscription-repository.port';
import { ProviderChargeCreationService } from '../services/provider-charge-creation.service';
import { IssueChargeForSubscriptionUseCase } from '../use-cases/issue-charge-for-subscription.use-case';
import { IssueNextChargesJob } from './issue-next-charges.job';
import { RetryPendingChargeCreationUseCase } from '../use-cases/retry-pending-charge-creation.use-case';

// The real repositories and row locks against Postgres (docs/LOCK_CATALOG.md B-R1, B-C1 and the
// creation lease). The clock is the real one, so every date is relative to today. The seeded BR
// price list (M25-S04) prices HOTSITE STANDARD at R$ 49,00 from 2026-01-01.
describe('IssueNextChargesJob (integration, UC-113)', () => {
  let app: INestApplication;
  let ds: DataSource;
  let eventBus: RoutingInMemoryEventBus;
  let issueOne: IssueChargeForSubscriptionUseCase;
  let issueNext: IssueNextChargesJob;
  let retry: RetryPendingChargeCreationUseCase;
  let creation: ProviderChargeCreationService;
  let txManager: ITransactionManager;
  let subscriptions: ISubscriptionRepository;
  let accounts: IBillingAccountRepository;
  let charges: IChargeRepository;
  let provider: FakeBillingProvider;
  const platform = new InMemoryBillingPlatformPort();
  const tenants: string[] = [];

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

  // A subscription due in five days with one HOTSITE item and a billable account.
  const seedTenant = async (options: { billable?: boolean } = {}): Promise<string> => {
    const tenantId = uuidv7();
    tenants.push(tenantId);
    const subscription = new SubscriptionEntityBuilder()
      .withTenantId(tenantId)
      .withStatus('ACTIVE')
      .withNextDueDate(addDaysUTC(todayUTC(), 5))
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
    if (options.billable !== false) account.withTaxId('11144477735', 'CPF').withAddress(address);
    await txManager.run(() => accounts.save(account.build()));
    platform.seed({
      tenantId,
      slug: `it-${tenantId.slice(-8)}`,
      countryCode: 'BR',
      timezone: 'America/Sao_Paulo',
      createdAt: new Date(),
      isActive: true,
    });
    return tenantId;
  };

  const chargeRows = (tenantId: string) =>
    ds.getRepository(ChargeEntity).find({ where: { tenantId } });
  const nextDueDateOf = async (tenantId: string): Promise<string | null> =>
    (await ds.getRepository(SubscriptionEntity).findOneByOrFail({ tenantId })).nextDueDate;
  const issuedEvents = (tenantId: string) =>
    eventBus.published.filter((e) => e.eventName === 'ChargeIssued' && e.tenantId === tenantId);

  beforeAll(async () => {
    ({ app, ds, eventBus } = await createBillingIntegrationApp({
      overrideProviders: [{ provide: BILLING_PLATFORM_PORT, useValue: platform }],
    }));
    issueOne = app.get(IssueChargeForSubscriptionUseCase);
    issueNext = app.get(IssueNextChargesJob);
    retry = app.get(RetryPendingChargeCreationUseCase);
    creation = app.get(ProviderChargeCreationService);
    txManager = app.get<ITransactionManager>(TRANSACTION_MANAGER);
    subscriptions = app.get<ISubscriptionRepository>(SUBSCRIPTION_REPOSITORY);
    accounts = app.get<IBillingAccountRepository>(BILLING_ACCOUNT_REPOSITORY);
    charges = app.get<IChargeRepository>(CHARGE_REPOSITORY);
    provider = app.get(FakeBillingProvider);
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    if (tenants.length > 0) {
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
    await app.close();
  });

  it('one run issues each due tenant its own charge, with its own lines, and never mixes tenants', async () => {
    const tenantA = await seedTenant();
    const tenantB = await seedTenant();

    await issueNext.run({ correlationId: 'corr-run' });

    for (const tenantId of [tenantA, tenantB]) {
      const rows = await chargeRows(tenantId);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        tenantId,
        kind: 'PERIOD',
        providerCreationStatus: 'READY',
        amountMinor: '4900',
      });
      const lines = await ds.getRepository(ChargeLineEntity).find({ where: { tenantId } });
      expect(lines.map((line) => line.featureKey)).toEqual(['HOTSITE']);
      expect(issuedEvents(tenantId)).toHaveLength(1);
      expect(await nextDueDateOf(tenantId)).not.toBe(addDaysUTC(todayUTC(), 5));
    }
  });

  it('running the job twice produces one charge per tenant', async () => {
    const tenantId = await seedTenant();

    await issueNext.run({ correlationId: 'corr-1' });
    await issueNext.run({ correlationId: 'corr-2' });

    expect(await chargeRows(tenantId)).toHaveLength(1);
    expect(issuedEvents(tenantId)).toHaveLength(1);
  });

  it('B-R1: parks behind a transaction holding the subscription row and decides on its committed state', async () => {
    const tenantId = await seedTenant();
    let release!: () => void;
    let signalLocked!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const locked = new Promise<void>((resolve) => (signalLocked = resolve));
    // The holder makes the tenant exempt (free access) and commits: nothing may be invoiced after.
    const holder = txManager.run(async () => {
      const subscription = await subscriptions.findByTenantIdForUpdate(tenantId);
      if (subscription === null) throw new Error('seeded subscription missing');
      subscription.setExempt(new Date(), 'holder', 'corr-holder');
      await subscriptions.save(subscription);
      signalLocked();
      await gate;
    });
    await locked;

    const since = await databaseNow(ds);
    const issuing = issueOne.execute({ tenantId, correlationId: 'corr-issue' });
    try {
      await waitForBlockedLock(ds, 'row', since);
    } finally {
      release();
      await holder;
    }

    await expect(issuing).resolves.toEqual({ outcome: 'NOT_DUE' });
    expect(await chargeRows(tenantId)).toHaveLength(0);
  });

  it('two concurrent issues of one subscription produce exactly one charge', async () => {
    const tenantId = await seedTenant();

    const results = await Promise.all([
      issueOne.execute({ tenantId, correlationId: 'corr-a' }),
      issueOne.execute({ tenantId, correlationId: 'corr-b' }),
    ]);

    expect(results.map((r) => r.outcome).sort()).toEqual(['ISSUED', 'NOT_DUE']);
    expect(await chargeRows(tenantId)).toHaveLength(1);
  });

  it('creation lease: the issue job racing the retry yields exactly one provider charge', async () => {
    const tenantId = await seedTenant();
    const before = provider.charges.size;
    // Insert the PENDING charge without creating it at the provider (an adapter-less creator).
    jest.spyOn(creation, 'execute').mockResolvedValueOnce('PROVIDER_FAILED');
    await issueOne.execute({ tenantId, correlationId: 'corr-seed' });
    const [pending] = await chargeRows(tenantId);
    expect(pending.providerCreationStatus).toBe('PENDING');
    jest.restoreAllMocks();

    const results = await Promise.all([
      creation.execute({ tenantId, chargeId: pending.id, correlationId: 'corr-a' }),
      creation.execute({ tenantId, chargeId: pending.id, correlationId: 'corr-b' }),
    ]);

    expect([...results].sort()).toEqual(['NOT_CLAIMED', 'READY']);
    expect(provider.charges.size - before).toBe(1);
    expect(issuedEvents(tenantId)).toHaveLength(1);
  });

  it('commits provider_customer_id before createCharge is called', async () => {
    const tenantId = await seedTenant();
    let storedBeforeCharge: string | null | undefined;
    const original = provider.createCharge.bind(provider);
    jest.spyOn(provider, 'createCharge').mockImplementation(async (input) => {
      const [row] = await ds.query<{ provider_customer_id: string | null }[]>(
        `SELECT provider_customer_id FROM billing.billing_accounts WHERE tenant_id = $1`,
        [tenantId],
      );
      storedBeforeCharge = row?.provider_customer_id;
      return original(input);
    });

    await issueOne.execute({ tenantId, correlationId: 'corr-1' });

    expect(storedBeforeCharge).toEqual(expect.any(String));
  });

  it('a webhook that lands before READY keeps the paid status and publishes no ChargeIssued', async () => {
    const tenantId = await seedTenant();
    const original = provider.createCharge.bind(provider);
    jest.spyOn(provider, 'createCharge').mockImplementation(async (input) => {
      const created = await original(input);
      // The webhook of S04: B-R1 is not needed to prove the point, B-C1 on the charge is.
      await txManager.run(async () => {
        const charge = await charges.findByIdForUpdate(tenantId, input.externalReference);
        charge?.markPaid('PIX', new Date(), null, 'corr-webhook', null);
        if (charge) await charges.save(charge);
      });
      return created;
    });

    await issueOne.execute({ tenantId, correlationId: 'corr-1' });

    const [row] = await chargeRows(tenantId);
    expect(row).toMatchObject({ status: 'PAID', providerCreationStatus: 'READY' });
    expect(row.providerChargeId).not.toBeNull();
    expect(issuedEvents(tenantId)).toHaveLength(0);
  });

  it('a provider failure leaves the charge PENDING and unannounced; the retry creates it without a duplicate', async () => {
    const tenantId = await seedTenant();
    provider.failNextCall('UNAVAILABLE');

    await issueOne.execute({ tenantId, correlationId: 'corr-1' });
    const [pending] = await chargeRows(tenantId);
    expect(pending.providerCreationStatus).toBe('PENDING');
    expect(issuedEvents(tenantId)).toHaveLength(0);

    // The failed attempt holds the lease for ten minutes; free it, as time would.
    await ds.query(
      `UPDATE billing.charges SET provider_creation_last_attempt_at = now() - interval '11 minutes' WHERE id = $1`,
      [pending.id],
    );
    await retry.execute({ correlationId: 'corr-2' });

    const rows = await chargeRows(tenantId);
    expect(rows).toHaveLength(1);
    expect(rows[0].providerCreationStatus).toBe('READY');
    expect(issuedEvents(tenantId)).toHaveLength(1);
  });

  it('a held identity inserts nothing, leaves the subscription due, and resumes once it is saved', async () => {
    const tenantId = await seedTenant({ billable: false });
    const due = await nextDueDateOf(tenantId);

    await expect(issueOne.execute({ tenantId, correlationId: 'corr-1' })).resolves.toEqual({
      outcome: 'HELD',
    });
    expect(await chargeRows(tenantId)).toHaveLength(0);
    expect(await nextDueDateOf(tenantId)).toBe(due);

    // The manager saves the identity (S16): the next run resumes with no operator step.
    const account = await accounts.findByTenantId(tenantId);
    await txManager.run(() =>
      accounts.save(
        new BillingAccountBuilder()
          .withId(account!.id)
          .withTenantId(tenantId)
          .withTaxId('11144477735', 'CPF')
          .withAddress(address)
          .build(),
      ),
    );

    await expect(issueOne.execute({ tenantId, correlationId: 'corr-2' })).resolves.toMatchObject({
      outcome: 'ISSUED',
    });
    expect(await chargeRows(tenantId)).toHaveLength(1);
  });
});
