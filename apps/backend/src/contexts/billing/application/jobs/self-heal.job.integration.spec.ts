import { uuidv7 } from '../../../../shared/domain/uuid-v7';
import { AppLogger } from '../../../../shared/observability/app-logger';
import { InMemoryInboxRepository } from '../../../../test/infrastructure/in-memory-inbox.repository';
import { createSweepWorld, type SweepWorld } from '../../../../test/utils/billing-sweep-world';
import { BillingAccountEntity } from '../../infrastructure/entities/billing-account.entity';
import { SignupRegistrationEntity } from '../../infrastructure/entities/signup-registration.entity';
import { SubscriptionItemEntity } from '../../infrastructure/entities/subscription-item.entity';
import { SubscriptionEntity } from '../../infrastructure/entities/subscription.entity';
import { TypeOrmSignupRegistrationRepository } from '../../infrastructure/repositories/typeorm-signup-registration.repository';
import { CheckProviderHealthUseCase } from '../use-cases/check-provider-health.use-case';
import { CreateTrialSubscriptionUseCase } from '../use-cases/create-trial-subscription.use-case';
import { EvaluateSuspensionFreezeUseCase } from '../use-cases/evaluate-suspension-freeze.use-case';
import { ReleaseStaleSignupRegistrationsUseCase } from '../use-cases/release-stale-signup-registrations.use-case';
import { RepairMissingSubscriptionsStep } from './repair-missing-subscriptions.helpers';
import { ProviderAccountsService } from '../services/provider-accounts.service';
import { SelfHealJob } from './self-heal.job';

const HOUR_MS = 3_600_000;

// The job over the real repositories and the fake provider. Its repair and provider-account reads
// select across the whole database, so the Platform side is the in-memory double (it lists only
// this spec's tenants) and the provider accounts are the ones a test names: the job cannot repair,
// freeze or heal another suite's rows. The status sweep a test runs afterwards is the existing
// cross-tenant job and is isolated the way its own integration spec is: every other suite's rows
// are recent or in the future, so none is due.
describe('SelfHealJob (integration, UC-140)', () => {
  let world: SweepWorld;
  let job: SelfHealJob;
  let evaluateFreeze: EvaluateSuspensionFreezeUseCase;
  const registrationIds: string[] = [];
  let accountKeys: string[] = [];
  // A test that needs the real query sets it: the subscriptions it seeded are then discovered.
  let useDatabaseKeys = false;

  beforeAll(async () => {
    world = await createSweepWorld();
    const registrationRepo = new TypeOrmSignupRegistrationRepository(
      world.ds.getRepository(SignupRegistrationEntity),
    );
    const createTrial = new CreateTrialSubscriptionUseCase(
      world.subscriptions,
      world.accounts,
      registrationRepo,
      world.prices,
      new InMemoryInboxRepository(),
      world.txManager,
      { appEnv: 'local', platformOwnerSlug: null },
    );
    evaluateFreeze = new EvaluateSuspensionFreezeUseCase(world.health);
    job = new SelfHealJob(
      new ProviderAccountsService(world.subscriptions, world.registry),
      world.clock,
      new RepairMissingSubscriptionsStep(
        world.platform,
        world.subscriptions,
        createTrial,
        world.clock,
      ),
      new ReleaseStaleSignupRegistrationsUseCase(registrationRepo),
      new CheckProviderHealthUseCase(
        world.registry,
        world.health,
        world.providerEvents,
        world.clock,
      ),
      evaluateFreeze,
    );
    // The accounts the run visits: none of the shared database's keys (BRL_FAKE belongs to every
    // suite), only the ones a test lists, unless it asks for the real query.
    const databaseKeys = world.subscriptions.listMerchantProfileKeys.bind(world.subscriptions);
    jest
      .spyOn(world.subscriptions, 'listMerchantProfileKeys')
      .mockImplementation(async () => (useDatabaseKeys ? databaseKeys() : accountKeys));
  });

  afterEach(async () => {
    accountKeys = [];
    useDatabaseKeys = false;
    world.platform.clear();
    await world.ds.query(
      `DELETE FROM "billing"."signup_registrations" WHERE "id" = ANY($1::uuid[])`,
      [registrationIds],
    );
    registrationIds.length = 0;
    await world.cleanup();
  });

  afterAll(async () => {
    jest.restoreAllMocks();
    await world.destroy();
  });

  const run = () => job.run({ correlationId: 'corr-run' });

  it('recreates the trial of a tenant whose subscription row is gone, in its own country and timezone', async () => {
    const tenant = await world.seedSubscription({ configure: (b) => b.withStatus('ACTIVE') });
    world.platform.seed({
      tenantId: tenant.tenantId,
      slug: `sh-${tenant.tenantId.slice(-8)}`,
      countryCode: 'BR',
      timezone: 'America/Manaus',
      createdAt: new Date(Date.now() - 2 * HOUR_MS),
      isActive: true,
    });
    // The lost-event state: the tenant exists, its subscription (and the rows under it) does not.
    const ds = world.ds;
    await ds.getRepository(BillingAccountEntity).delete({ tenantId: tenant.tenantId });
    await ds.getRepository(SubscriptionItemEntity).delete({ tenantId: tenant.tenantId });
    await ds.getRepository(SubscriptionEntity).delete({ tenantId: tenant.tenantId });

    const result = await run();

    expect(result.repair).toMatchObject({ ok: true, value: { repaired: 1 } });
    const row = await world.subscriptionRow(tenant.tenantId);
    expect(row.status).toBe('TRIALING');
    expect(row.timezone).toBe('America/Manaus');
    expect(row.currency).toBe('BRL');
  });

  it('is idempotent: a second run repairs nothing and the tenant keeps its one subscription', async () => {
    const tenantId = uuidv7();
    world.platform.seed({
      tenantId,
      slug: `sh-${tenantId.slice(-8)}`,
      countryCode: 'BR',
      timezone: 'America/Sao_Paulo',
      createdAt: new Date(Date.now() - 2 * HOUR_MS),
      isActive: true,
    });

    const first = await run();
    const second = await run();
    await world.ds.query(`DELETE FROM "billing"."billing_accounts" WHERE "tenant_id" = $1`, [
      tenantId,
    ]);
    await world.ds.query(`DELETE FROM "billing"."subscription_items" WHERE "tenant_id" = $1`, [
      tenantId,
    ]);
    await world.ds.query(`DELETE FROM "billing"."subscriptions" WHERE "tenant_id" = $1`, [
      tenantId,
    ]);

    expect(first.repair).toMatchObject({ ok: true, value: { repaired: 1 } });
    expect(second.repair).toMatchObject({ ok: true, value: { repaired: 0 } });
  });

  it('never repairs an inactive tenant or one younger than the provisioning window', async () => {
    const inactive = uuidv7();
    const young = uuidv7();
    world.platform.seed({
      tenantId: inactive,
      slug: `in-${inactive.slice(-8)}`,
      countryCode: 'BR',
      timezone: 'America/Sao_Paulo',
      createdAt: new Date(Date.now() - 2 * HOUR_MS),
      isActive: false,
    });
    world.platform.seed({
      tenantId: young,
      slug: `yo-${young.slice(-8)}`,
      countryCode: 'BR',
      timezone: 'America/Sao_Paulo',
      createdAt: new Date(Date.now() - 60_000),
      isActive: true,
    });

    await run();

    await expect(
      world.ds.getRepository(SubscriptionEntity).existsBy({ tenantId: inactive }),
    ).resolves.toBe(false);
    await expect(
      world.ds.getRepository(SubscriptionEntity).existsBy({ tenantId: young }),
    ).resolves.toBe(false);
  });

  it('releases a RESERVED registration older than an hour and keeps a younger one', async () => {
    const stale = uuidv7();
    const young = uuidv7();
    registrationIds.push(stale, young);
    await world.ds.query(
      `INSERT INTO "billing"."signup_registrations" ("id", "source", "status", "exempt", "created_at")
       VALUES ($1, 'OPERATOR', 'RESERVED', false, now() - interval '61 minutes'),
              ($2, 'OPERATOR', 'RESERVED', false, now() - interval '5 minutes')`,
      [stale, young],
    );

    const result = await run();

    expect(result.release.ok).toBe(true);
    const repo = world.ds.getRepository(SignupRegistrationEntity);
    await expect(repo.existsBy({ id: stale })).resolves.toBe(false);
    await expect(repo.existsBy({ id: young })).resolves.toBe(true);
  });

  describe('the suspension freeze', () => {
    it('with the freeze active the status sweep suspends nobody on that account; after a reconcile success it does', async () => {
      const key = `TEST_${uuidv7().slice(-12)}`;
      accountKeys = [key];
      world.trackHealthKey(key);
      // Reconcile last succeeded 30 hours ago: stale, so the run sets the freeze (the health step
      // has no adapter for a test key, so only the freeze step is run directly).
      await world.health.recordReconcileOk(key, new Date(Date.now() - 30 * HOUR_MS), false);
      const trial = await world.seedSubscription({
        configure: (b) =>
          b
            .withStatus('TRIALING')
            .withMerchantProfileKey(key)
            .withTrialEndsAt(new Date(Date.now() - 2 * 24 * HOUR_MS)),
      });

      const set = await evaluateFreeze.execute({
        merchantProfileKey: key,
        now: new Date(),
        correlationId: 'c',
      });
      await world.sweep.run({ correlationId: 'corr-sweep' });
      const whileFrozen = (await world.subscriptionRow(trial.tenantId)).status;

      await world.health.recordReconcileOk(key, new Date(Date.now() + 1000), false);
      const cleared = await evaluateFreeze.execute({
        merchantProfileKey: key,
        now: new Date(Date.now() + 2000),
        correlationId: 'c',
      });
      await world.sweep.run({ correlationId: 'corr-sweep' });

      expect(set).toMatchObject({ frozen: true, change: 'SET' });
      expect(whileFrozen).toBe('TRIALING');
      expect(cleared).toMatchObject({ frozen: false, change: 'CLEARED' });
      expect((await world.subscriptionRow(trial.tenantId)).status).toBe('SUSPENDED');
    });

    it('no provider_health row means not frozen: nothing is created or frozen for an account that never reconciled', async () => {
      const key = `TEST_${uuidv7().slice(-12)}`;

      const result = await evaluateFreeze.execute({
        merchantProfileKey: key,
        now: new Date(),
        correlationId: 'c',
      });

      expect(result).toMatchObject({ frozen: false, change: 'NONE' });
      expect(await world.health.findByKey(key)).toBeNull();
    });
  });

  it('records the provider health of an account through the fake provider (webhook paused, re-enabled once, alert kept)', async () => {
    accountKeys = ['BRL_FAKE'];
    const before = await world.health.findByKey('BRL_FAKE');
    world.provider.pauseWebhookQueue();

    try {
      const result = await run();

      expect(result.health).toMatchObject({
        ok: true,
        value: [
          { merchantProfileKey: 'BRL_FAKE', webhookAlert: 'RAISED', reenableAttempted: true },
        ],
      });
      const row = await world.health.findByKey('BRL_FAKE');
      expect(row?.webhookStatus).toBe('PAUSED');
      expect(row?.webhookReenabledAt).not.toBeNull();
    } finally {
      // Put the shared row back the way this spec found it, even when an assertion failed.
      if (before === null) {
        await world.ds.query(
          `DELETE FROM "billing"."provider_health" WHERE "merchant_profile_key" = 'BRL_FAKE'`,
        );
      } else {
        await world.health.save(before);
      }
    }
  });

  // The staging state: the M25-S05 backfill gave every tenant `BRL_ASAAS_SANDBOX`, and the registry
  // has no adapter for it until M26-S37. The run used to throw on it, nack and dead-letter.
  it('a subscription on a key no adapter serves yet does not fail the run: the real key query finds it and the served account is still checked', async () => {
    const warn = jest.spyOn(AppLogger.prototype, 'warn').mockImplementation();
    const sandbox = await world.seedSubscription({
      configure: (b) => b.withStatus('ACTIVE').withMerchantProfileKey('BRL_ASAAS_SANDBOX'),
    });
    await world.seedSubscription({ configure: (b) => b.withStatus('ACTIVE') });
    useDatabaseKeys = true;
    const before = await world.health.findByKey('BRL_FAKE');

    try {
      const result = await run();

      const checked = result.health.ok ? result.health.value.map((r) => r.merchantProfileKey) : [];
      expect(result.health.ok).toBe(true);
      expect(result.freeze.ok).toBe(true);
      expect(checked).toContain('BRL_FAKE');
      expect(checked).not.toContain('BRL_ASAAS_SANDBOX');
      // Found by the real query, then dropped: the log is what proves the row was discovered.
      expect(warn).toHaveBeenCalledWith('billing_provider_not_supported: skipped', {
        merchantProfileKey: 'BRL_ASAAS_SANDBOX',
      });
      expect((await world.subscriptionRow(sandbox.tenantId)).merchantProfileKey).toBe(
        'BRL_ASAAS_SANDBOX',
      );
      expect(await world.health.findByKey('BRL_ASAAS_SANDBOX')).toBeNull();
    } finally {
      // Put the shared row back the way this spec found it, even when an assertion failed.
      if (before === null) {
        await world.ds.query(
          `DELETE FROM "billing"."provider_health" WHERE "merchant_profile_key" = 'BRL_FAKE'`,
        );
      } else {
        await world.health.save(before);
      }
    }
  });
});
