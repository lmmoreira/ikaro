import { DataSource } from 'typeorm';
import { uuidv7 } from '../../../../shared/domain/uuid-v7';
import { TypeOrmTransactionManager } from '../../../../shared/infrastructure/typeorm-transaction-manager';
import { SystemClock } from '../../../../shared/infrastructure/clock/system-clock.adapter';
import { addDaysUTC, todayUTC } from '../../../../shared/utils/calendar-date';
import {
  BillingAccountBuilder,
  SubscriptionEntityBuilder,
  SubscriptionItemEntityBuilder,
} from '../../../../test/builders/billing';
import { AddressBuilder } from '../../../../test/builders/shared';
import { InMemoryApplicationConfig } from '../../../../test/infrastructure/in-memory-application-config';
import { InMemoryBillingPlatformPort } from '../../../../test/infrastructure/in-memory-billing-platform.port';
import { InMemoryOutboxPublisher } from '../../../../test/infrastructure/in-memory-outbox-publisher';
import { createTestDataSource } from '../../../../test/test-datasource';
import { databaseNow, waitForBlockedLock } from '../../../../test/utils/booking-lock-race-world';
import { BillingAccountEntity } from '../../infrastructure/entities/billing-account.entity';
import { ChargeLineEntity } from '../../infrastructure/entities/charge-line.entity';
import { ChargeEntity } from '../../infrastructure/entities/charge.entity';
import { FeaturePriceVersionEntity } from '../../infrastructure/entities/feature-price-version.entity';
import { FeaturePriceEntity } from '../../infrastructure/entities/feature-price.entity';
import { SubscriptionItemEntity } from '../../infrastructure/entities/subscription-item.entity';
import { SubscriptionEntity } from '../../infrastructure/entities/subscription.entity';
import { BillingProviderRegistry } from '../../infrastructure/providers/billing-provider.registry';
import { FakeBillingProvider } from '../../infrastructure/providers/fake-billing.provider';
import { TypeOrmBillingAccountRepository } from '../../infrastructure/repositories/typeorm-billing-account.repository';
import { TypeOrmChargeRepository } from '../../infrastructure/repositories/typeorm-charge.repository';
import { TypeOrmFeaturePriceRepository } from '../../infrastructure/repositories/typeorm-feature-price.repository';
import { TypeOrmSubscriptionRepository } from '../../infrastructure/repositories/typeorm-subscription.repository';
import { ProviderChargeCreationService } from '../services/provider-charge-creation.service';
import { IssueChargeForSubscriptionUseCase } from '../use-cases/issue-charge-for-subscription.use-case';
import { RetryPendingChargeCreationUseCase } from '../use-cases/retry-pending-charge-creation.use-case';
import { IssueNextChargesJob } from './issue-next-charges.job';

// The real repositories and row locks against Postgres (docs/LOCK_CATALOG.md B-R1, B-C1 and the
// creation lease), composed by hand rather than through a booted Nest application: the module's own
// DI wiring is already exercised by the provider webhook controller's integration spec, and this
// suite stays small. The clock is the real one, so every date is relative to today. The seeded BR
// price list (M25-S04) prices HOTSITE STANDARD at R$ 49,00 from 2026-01-01.
describe('IssueNextChargesJob (integration, UC-113)', () => {
  let ds: DataSource;
  let outbox: InMemoryOutboxPublisher;
  let issueOne: IssueChargeForSubscriptionUseCase;
  let issueNext: IssueNextChargesJob;
  let retry: RetryPendingChargeCreationUseCase;
  let creation: ProviderChargeCreationService;
  let txManager: TypeOrmTransactionManager;
  let subscriptions: TypeOrmSubscriptionRepository;
  let accounts: TypeOrmBillingAccountRepository;
  let charges: TypeOrmChargeRepository;
  let provider: FakeBillingProvider;
  const platform = new InMemoryBillingPlatformPort();
  const tenants: string[] = [];

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
    if (options.billable !== false)
      account.withTaxId('11144477735', 'CPF').withAddress(new AddressBuilder().build());
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
    outbox.published.filter((e) => e.eventName === 'ChargeIssued' && e.tenantId === tenantId);

  beforeAll(async () => {
    ds = await createTestDataSource();
    txManager = new TypeOrmTransactionManager(ds);
    outbox = new InMemoryOutboxPublisher();
    const clock = new SystemClock();
    provider = new FakeBillingProvider(clock);
    subscriptions = new TypeOrmSubscriptionRepository(ds.getRepository(SubscriptionEntity), outbox);
    accounts = new TypeOrmBillingAccountRepository(ds.getRepository(BillingAccountEntity));
    charges = new TypeOrmChargeRepository(ds.getRepository(ChargeEntity), outbox);
    const prices = new TypeOrmFeaturePriceRepository(
      ds.getRepository(FeaturePriceEntity),
      ds.getRepository(FeaturePriceVersionEntity),
    );
    creation = new ProviderChargeCreationService(
      new BillingProviderRegistry('local', provider),
      accounts,
      subscriptions,
      charges,
      platform,
      new InMemoryApplicationConfig({ FRONTEND_URL: 'http://localhost:3000' }),
      txManager,
      clock,
    );
    issueOne = new IssueChargeForSubscriptionUseCase(
      subscriptions,
      accounts,
      charges,
      prices,
      txManager,
      clock,
      creation,
    );
    retry = new RetryPendingChargeCreationUseCase(charges, clock, creation);
    issueNext = new IssueNextChargesJob(subscriptions, clock, issueOne, retry);
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
    await ds.destroy();
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

    // The first creator is held at the provider call, so the lease is provably taken while the
    // second one tries.
    let release!: () => void;
    let reached!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const atProvider = new Promise<void>((resolve) => (reached = resolve));
    const original = provider.createCharge.bind(provider);
    jest.spyOn(provider, 'createCharge').mockImplementation(async (input) => {
      reached();
      await gate;
      return original(input);
    });
    const first = creation.execute({ tenantId, chargeId: pending.id, correlationId: 'corr-a' });
    await atProvider;
    let second: string;
    try {
      second = await creation.execute({ tenantId, chargeId: pending.id, correlationId: 'corr-b' });
    } finally {
      release();
    }

    expect(second).toBe('NOT_CLAIMED');
    expect(await first).toBe('READY');
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
          .withAddress(new AddressBuilder().build())
          .build(),
      ),
    );

    await expect(issueOne.execute({ tenantId, correlationId: 'corr-2' })).resolves.toMatchObject({
      outcome: 'ISSUED',
    });
    expect(await chargeRows(tenantId)).toHaveLength(1);
  });
});
