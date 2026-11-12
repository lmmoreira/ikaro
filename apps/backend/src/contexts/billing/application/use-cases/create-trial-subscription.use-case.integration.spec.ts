import { INestApplication } from '@nestjs/common';
import { FEATURE_KEYS } from '@ikaro/validation';
import { DataSource } from 'typeorm';
import { uuidv7 } from '../../../../shared/domain/uuid-v7';
import { InboxRecordEntity } from '../../../../shared/infrastructure/inbox/inbox-record.entity';
import { INBOX_REPOSITORY } from '../../../../shared/ports/inbox.port';
import { TRANSACTION_MANAGER } from '../../../../shared/ports/transaction-manager.port';
import { SignupRegistrationEntityBuilder } from '../../../../test/builders/billing';
import { TenantProvisionedEventBuilder } from '../../../../test/builders/platform';
import { createBillingIntegrationApp } from '../../../../test/utils/billing-integration-app';
import { SignupRegistration } from '../../domain/signup-registration';
import { SignupRegistrationNotAvailableError } from '../../domain/errors/billing-domain.error';
import { BillingAccountEntity } from '../../infrastructure/entities/billing-account.entity';
import { SignupRegistrationEntity } from '../../infrastructure/entities/signup-registration.entity';
import { SubscriptionItemEntity } from '../../infrastructure/entities/subscription-item.entity';
import { SubscriptionEntity } from '../../infrastructure/entities/subscription.entity';
import { TenantProvisionedBillingHandler } from '../../infrastructure/events/tenant-provisioned-billing.handler';
import { BILLING_PROVISIONING_CONFIG } from '../ports/billing-provisioning-config.port';
import { BILLING_ACCOUNT_REPOSITORY } from '../ports/billing-account-repository.port';
import { FEATURE_PRICE_REPOSITORY } from '../ports/feature-price-repository.port';
import {
  ISignupRegistrationRepository,
  SIGNUP_REGISTRATION_REPOSITORY,
} from '../ports/signup-registration-repository.port';
import { SUBSCRIPTION_REPOSITORY } from '../ports/subscription-repository.port';
import { CreateTrialSubscriptionUseCase } from './create-trial-subscription.use-case';

// A fresh 11-digit tax id per test, so a run overlapping this one can never hold the same value.
const newTaxId = (): string => uuidv7().replace(/\D/g, '').padEnd(11, '0').slice(0, 11);

describe('CreateTrialSubscriptionUseCase (integration)', () => {
  let app: INestApplication;
  let ds: DataSource;
  let eventBus: Awaited<ReturnType<typeof createBillingIntegrationApp>>['eventBus'];
  let handler: TenantProvisionedBillingHandler;
  const tenantIds: string[] = [];
  const registrationIds: string[] = [];
  const eventIds: string[] = [];

  const newTenant = (): string => {
    const tenantId = uuidv7();
    tenantIds.push(tenantId);
    return tenantId;
  };

  const seedRegistration = async (
    entity: SignupRegistrationEntity = new SignupRegistrationEntityBuilder().asOperator().build(),
  ): Promise<string> => {
    registrationIds.push(entity.id);
    await ds.getRepository(SignupRegistrationEntity).insert(entity);
    return entity.id;
  };

  const provisioned = (tenantId: string, registrationId: string, slug = `t-${uuidv7()}`) => {
    const event = new TenantProvisionedEventBuilder()
      .withTenantId(tenantId)
      .withSlug(slug)
      .withAdminEmail('dono@lavacar.com.br')
      .withRegistrationId(registrationId)
      .build();
    eventIds.push(event.eventId);
    return event;
  };

  const subscriptionsOf = (...ids: string[]) =>
    ds.getRepository(SubscriptionEntity).find({ where: ids.map((tenantId) => ({ tenantId })) });

  const registrationRow = (id: string) =>
    ds.getRepository(SignupRegistrationEntity).findOneByOrFail({ id });

  // A real use case whose registration repository is wrapped, to force a failure or an interleaving
  // the real one would only produce by chance.
  const useCaseWith = (registrations: ISignupRegistrationRepository) =>
    new CreateTrialSubscriptionUseCase(
      app.get(SUBSCRIPTION_REPOSITORY),
      app.get(BILLING_ACCOUNT_REPOSITORY),
      registrations,
      app.get(FEATURE_PRICE_REPOSITORY),
      app.get(INBOX_REPOSITORY),
      app.get(TRANSACTION_MANAGER),
      app.get(BILLING_PROVISIONING_CONFIG),
    );

  const inputOf = (tenantId: string, registrationId: string) => {
    const event = provisioned(tenantId, registrationId);
    return {
      tenantId,
      slug: event.data.slug,
      countryCode: event.data.countryCode,
      timezone: event.data.timezone,
      adminEmail: event.data.adminEmail,
      occurredAt: event.occurredAt,
      registrationId,
      eventId: event.eventId,
      correlationId: event.correlationId,
    };
  };

  beforeAll(async () => {
    ({ app, ds, eventBus } = await createBillingIntegrationApp());
    handler = app.get(TenantProvisionedBillingHandler);
  });

  afterEach(async () => {
    await ds.query(`DELETE FROM "billing"."billing_accounts" WHERE "tenant_id" = ANY($1::uuid[])`, [
      tenantIds,
    ]);
    await ds.query(
      `DELETE FROM "billing"."subscription_items" WHERE "tenant_id" = ANY($1::uuid[])`,
      [tenantIds],
    );
    await ds.query(`DELETE FROM "billing"."subscriptions" WHERE "tenant_id" = ANY($1::uuid[])`, [
      tenantIds,
    ]);
    await ds.query(`DELETE FROM "billing"."signup_registrations" WHERE "id" = ANY($1::uuid[])`, [
      registrationIds,
    ]);
    await ds.query(`DELETE FROM "shared"."inbox" WHERE "event_id" = ANY($1::uuid[])`, [eventIds]);
    tenantIds.length = 0;
    registrationIds.length = 0;
    eventIds.length = 0;
  });

  afterAll(async () => {
    await app.close();
  });

  it('turns a published TenantProvisioned into a trial, its items, the account and a completed registration', async () => {
    const tenantId = newTenant();
    const cpf = newTaxId();
    const registrationId = await seedRegistration(
      new SignupRegistrationEntityBuilder().withTaxId('CPF', cpf).build(),
    );
    const before = await registrationRow(registrationId);
    const event = provisioned(tenantId, registrationId);

    await eventBus.publish(event);

    const [subscription] = await subscriptionsOf(tenantId);
    expect(subscription).toMatchObject({
      status: 'TRIALING',
      exempt: false,
      currency: 'BRL',
      countryCode: 'BR',
      timezone: 'America/Sao_Paulo',
      merchantProfileKey: 'BRL_FAKE',
    });
    expect(subscription.trialEndsAt).toBeInstanceOf(Date);
    const items = await ds
      .getRepository(SubscriptionItemEntity)
      .find({ where: { subscriptionId: subscription.id } });
    expect(items.map((item) => item.featureKey).sort()).toEqual([...FEATURE_KEYS].sort());
    const account = await ds.getRepository(BillingAccountEntity).findOneByOrFail({ tenantId });
    expect(account).toMatchObject({ taxId: cpf, taxIdType: 'CPF' });
    expect(account.termsVersion).toBe(before.termsVersion);
    expect(account.termsAcceptedBy).toBe('dono@lavacar.com.br');
    const after = await registrationRow(registrationId);
    // The tax id moved to the account; the sub, the terms and the tenant stay on the registration.
    expect(after).toMatchObject({
      status: 'COMPLETED',
      tenantId,
      taxId: null,
      taxIdType: null,
      googleSub: before.googleSub,
      termsVersion: before.termsVersion,
    });
    await expect(
      ds
        .getRepository(InboxRecordEntity)
        .existsBy({ eventId: event.eventId, consumerName: 'create-trial-subscription' }),
    ).resolves.toBe(true);
  });

  it('starts an ACTIVE exempt subscription for an exempt operator registration', async () => {
    const tenantId = newTenant();
    const registrationId = await seedRegistration(
      new SignupRegistrationEntityBuilder().asOperator().withExempt().build(),
    );

    await eventBus.publish(provisioned(tenantId, registrationId));

    const [subscription] = await subscriptionsOf(tenantId);
    expect(subscription).toMatchObject({ status: 'ACTIVE', exempt: true, trialEndsAt: null });
  });

  it('creates nothing new when the same event is delivered twice (A1)', async () => {
    const tenantId = newTenant();
    const registrationId = await seedRegistration();
    const event = provisioned(tenantId, registrationId);

    await eventBus.publish(event);
    await handler.handle(event);

    expect(await subscriptionsOf(tenantId)).toHaveLength(1);
    await expect(ds.getRepository(BillingAccountEntity).countBy({ tenantId })).resolves.toBe(1);
  });

  it('refuses an unknown registration and one COMPLETED for another tenant, attaching nothing (A8)', async () => {
    const owner = newTenant();
    const registrationId = await seedRegistration();
    await eventBus.publish(provisioned(owner, registrationId));
    const stranger = newTenant();

    await expect(handler.handle(provisioned(stranger, registrationId))).rejects.toThrow(
      SignupRegistrationNotAvailableError,
    );
    await expect(handler.handle(provisioned(stranger, uuidv7()))).rejects.toThrow(
      SignupRegistrationNotAvailableError,
    );

    expect(await subscriptionsOf(stranger)).toHaveLength(0);
    expect((await registrationRow(registrationId)).tenantId).toBe(owner);
  });

  it('rolls back the subscription, items, account and inbox row when the registration cannot be completed, and a retry then succeeds', async () => {
    const tenantId = newTenant();
    const registrationId = await seedRegistration();
    const real = app.get<ISignupRegistrationRepository>(SIGNUP_REGISTRATION_REPOSITORY);
    let failComplete = true;
    const input = inputOf(tenantId, registrationId);
    const flaky = useCaseWith({
      findGoogleSubHistory: (sub) => real.findGoogleSubHistory(sub),
      isTaxIdHeldByUnpaid: (taxId) => real.isTaxIdHeldByUnpaid(taxId),
      save: (registration) => real.save(registration),
      findById: (id) => real.findById(id),
      complete: async (registration: SignupRegistration) => {
        if (failComplete) throw new Error('simulated failure after the subscription was written');
        await real.complete(registration);
      },
    });

    await expect(flaky.execute(input)).rejects.toThrow('simulated failure');

    expect(await subscriptionsOf(tenantId)).toHaveLength(0);
    await expect(ds.getRepository(BillingAccountEntity).countBy({ tenantId })).resolves.toBe(0);
    await expect(
      ds.getRepository(InboxRecordEntity).existsBy({ eventId: input.eventId }),
    ).resolves.toBe(false);
    expect((await registrationRow(registrationId)).status).toBe('RESERVED');

    failComplete = false;
    await expect(flaky.execute(input)).resolves.toEqual({ created: true });
    expect(await subscriptionsOf(tenantId)).toHaveLength(1);
  });

  it('lets exactly one of two tenants that name the same registration keep it, even when both pass the check first', async () => {
    const [first, second] = [newTenant(), newTenant()];
    const registrationId = await seedRegistration();
    const real = app.get<ISignupRegistrationRepository>(SIGNUP_REGISTRATION_REPOSITORY);
    // Both executions load the registration as RESERVED before either completes it.
    let loaded = 0;
    let release: () => void = () => undefined;
    const bothLoaded = new Promise<void>((resolve) => {
      release = resolve;
    });
    const racing = useCaseWith({
      findGoogleSubHistory: (sub) => real.findGoogleSubHistory(sub),
      isTaxIdHeldByUnpaid: (taxId) => real.isTaxIdHeldByUnpaid(taxId),
      save: (registration) => real.save(registration),
      complete: (registration) => real.complete(registration),
      findById: async (id) => {
        const registration = await real.findById(id);
        if (++loaded === 2) release();
        await bothLoaded;
        return registration;
      },
    });

    const results = await Promise.allSettled([
      racing.execute(inputOf(first, registrationId)),
      racing.execute(inputOf(second, registrationId)),
    ]);

    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    const loser = results.find((result) => result.status === 'rejected');
    expect(loser).toMatchObject({ reason: expect.any(SignupRegistrationNotAvailableError) });
    const winners = await subscriptionsOf(first, second);
    expect(winners).toHaveLength(1);
    expect((await registrationRow(registrationId)).tenantId).toBe(winners[0].tenantId);
  });

  describe('tenant isolation', () => {
    it('gives each tenant its own subscription and account, and each registration completes for its own tenant only', async () => {
      const [tenantA, tenantB] = [newTenant(), newTenant()];
      const registrationA = await seedRegistration();
      const registrationB = await seedRegistration();

      await eventBus.publish(provisioned(tenantA, registrationA));
      await eventBus.publish(provisioned(tenantB, registrationB));

      expect((await subscriptionsOf(tenantA)).map((row) => row.tenantId)).toEqual([tenantA]);
      expect((await subscriptionsOf(tenantB)).map((row) => row.tenantId)).toEqual([tenantB]);
      const accounts = await ds
        .getRepository(BillingAccountEntity)
        .find({ where: [{ tenantId: tenantA }, { tenantId: tenantB }] });
      expect(accounts.map((account) => account.tenantId).sort()).toEqual([tenantA, tenantB].sort());
      expect((await registrationRow(registrationA)).tenantId).toBe(tenantA);
      expect((await registrationRow(registrationB)).tenantId).toBe(tenantB);
    });
  });
});
