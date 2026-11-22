import { uuidv7 } from '../../../../shared/domain/uuid-v7';
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
import { SelfHealJob } from './self-heal.job';

const HOUR_MS = 3_600_000;

// The job over the real repositories and the fake provider. It selects across the whole database,
// so the Platform side is the in-memory double (it lists only this spec's tenants) and the
// provider accounts are this spec's: nothing here can repair, freeze or heal another suite's rows.
describe('SelfHealJob (integration, UC-140)', () => {
  let world: SweepWorld;
  let job: SelfHealJob;
  let evaluateFreeze: EvaluateSuspensionFreezeUseCase;
  const registrationIds: string[] = [];
  let accountKeys: string[] = [];

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
      world.subscriptions,
      world.clock,
      new RepairMissingSubscriptionsStep(world.platform, world.subscriptions, createTrial),
      new ReleaseStaleSignupRegistrationsUseCase(registrationRepo),
      new CheckProviderHealthUseCase(world.registry, world.health, world.providerEvents),
      evaluateFreeze,
    );
    // The accounts the run visits: none of the shared database's keys (BRL_FAKE belongs to every
    // suite), only the ones a test lists.
    jest
      .spyOn(world.subscriptions, 'listMerchantProfileKeys')
      .mockImplementation(async () => accountKeys);
  });

  afterEach(async () => {
    accountKeys = [];
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

    const result = await run();

    expect(result.health).toMatchObject({
      ok: true,
      value: [{ merchantProfileKey: 'BRL_FAKE', webhookAlert: 'RAISED', reenableAttempted: true }],
    });
    expect((await world.health.findByKey('BRL_FAKE'))?.webhookStatus).toBe('PAUSED');
    // Put the shared row back the way this spec found it.
    if (before === null) {
      await world.ds.query(
        `DELETE FROM "billing"."provider_health" WHERE "merchant_profile_key" = 'BRL_FAKE'`,
      );
    } else {
      await world.health.save(before);
    }
  });
});
