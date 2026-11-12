import { countrySpec } from '@ikaro/i18n';
import { FEATURE_KEYS } from '@ikaro/validation';
import { uuidv7 } from '../../../../shared/domain/uuid-v7';
import { TaxId } from '../../../../shared/value-objects/tax-id.vo';
import { FeaturePriceBuilder, SignupRegistrationBuilder } from '../../../../test/builders/billing';
import { InMemoryInboxRepository } from '../../../../test/infrastructure/in-memory-inbox.repository';
import { InMemoryTransactionManager } from '../../../../test/infrastructure/in-memory-transaction-manager';
import { InMemoryBillingAccountRepository } from '../../../../test/repositories/billing/in-memory-billing-account.repository';
import { InMemoryFeaturePriceRepository } from '../../../../test/repositories/billing/in-memory-feature-price.repository';
import { InMemorySignupRegistrationRepository } from '../../../../test/repositories/billing/in-memory-signup-registration.repository';
import { InMemorySubscriptionRepository } from '../../../../test/repositories/billing/in-memory-subscription.repository';
import {
  FeaturePriceNotFoundError,
  SignupRegistrationNotAvailableError,
} from '../../domain/errors/billing-domain.error';
import type { SignupRegistration } from '../../domain/signup-registration';
import type { BillingProvisioningConfig } from '../ports/billing-provisioning-config.port';
import {
  CreateTrialSubscriptionUseCase,
  type CreateTrialSubscriptionUseCaseInput,
} from './create-trial-subscription.use-case';

const OWNER_SLUG = 'ikaro';
// 09:00 in America/Sao_Paulo (UTC-3), a Wednesday.
const OCCURRED_AT = '2026-11-11T12:00:00.000Z';
const CPF = '529.982.247-25';

describe('CreateTrialSubscriptionUseCase', () => {
  let subscriptions: InMemorySubscriptionRepository;
  let accounts: InMemoryBillingAccountRepository;
  let registrations: InMemorySignupRegistrationRepository;
  let prices: InMemoryFeaturePriceRepository;
  let inbox: InMemoryInboxRepository;
  let txManager: InMemoryTransactionManager;
  let config: BillingProvisioningConfig;
  let useCase: CreateTrialSubscriptionUseCase;

  beforeEach(() => {
    subscriptions = new InMemorySubscriptionRepository();
    accounts = new InMemoryBillingAccountRepository();
    registrations = new InMemorySignupRegistrationRepository();
    prices = new InMemoryFeaturePriceRepository();
    prices.seed(new FeaturePriceBuilder().withCountryCode('BR').build());
    inbox = new InMemoryInboxRepository();
    txManager = new InMemoryTransactionManager();
    config = { appEnv: 'local', platformOwnerSlug: OWNER_SLUG };
    useCase = new CreateTrialSubscriptionUseCase(
      subscriptions,
      accounts,
      registrations,
      prices,
      inbox,
      txManager,
      config,
    );
  });

  const reserve = async (registration: SignupRegistration): Promise<string> => {
    await registrations.save(registration);
    return registration.id;
  };

  const input = (
    overrides: Partial<CreateTrialSubscriptionUseCaseInput> = {},
  ): CreateTrialSubscriptionUseCaseInput => ({
    tenantId: uuidv7(),
    slug: 'lavacar',
    countryCode: 'BR',
    timezone: 'America/Sao_Paulo',
    adminEmail: 'dono@lavacar.com.br',
    occurredAt: OCCURRED_AT,
    correlationId: uuidv7(),
    eventId: uuidv7(),
    ...overrides,
  });

  describe('a non-exempt tenant', () => {
    it('starts a TRIALING subscription with the default paid items for every feature (A3)', async () => {
      const registrationId = await reserve(new SignupRegistrationBuilder().asOperator().build());
      const request = input({ registrationId });

      await expect(useCase.execute(request)).resolves.toEqual({ created: true });

      const [subscription] = subscriptions.saved;
      expect(subscription.tenantId).toBe(request.tenantId);
      expect(subscription.status).toBe('TRIALING');
      expect(subscription.exempt).toBe(false);
      expect(subscription.currency).toBe('BRL');
      expect(subscription.merchantProfileKey).toBe('BRL_FAKE');
      expect(subscription.items.map((item) => item.featureKey).sort()).toEqual(
        [...FEATURE_KEYS].sort(),
      );
      expect(subscription.items.every((item) => item.endsAt === null)).toBe(true);
    });

    it('ends the trial at the tenant-local midnight closing day 14, counted from the event instant', async () => {
      await useCase.execute(input({ occurredAt: OCCURRED_AT }));

      const [subscription] = subscriptions.saved;
      // 2026-11-11 local + 14 days = 2026-11-25, local midnight = 03:00Z (no DST in Sao Paulo).
      expect(subscription.trialEndsAt).toEqual(new Date('2026-11-25T03:00:00.000Z'));
      expect(subscription.nextDueDate?.value).toBe('2026-11-25');
      expect(subscription.anchorDay).toBe(25);
    });

    it('keeps the local midnight across a DST change inside the window', async () => {
      prices.seed(new FeaturePriceBuilder().withCountryCode('US').build());

      await useCase.execute(
        input({
          countryCode: 'US',
          timezone: 'America/New_York',
          // US DST starts 2026-03-08; 2026-03-01 + 14 = 2026-03-15, local midnight in EDT = 04:00Z.
          occurredAt: '2026-03-01T15:00:00.000Z',
        }),
      );

      const [subscription] = subscriptions.saved;
      expect(subscription.currency).toBe('USD');
      expect(subscription.merchantProfileKey).toBe('USD_FAKE');
      expect(subscription.trialEndsAt).toEqual(new Date('2026-03-15T04:00:00.000Z'));
    });

    it('takes the merchant profile from the environment and the country, never the tenant', async () => {
      config = { appEnv: 'staging', platformOwnerSlug: null };
      useCase = new CreateTrialSubscriptionUseCase(
        subscriptions,
        accounts,
        registrations,
        prices,
        inbox,
        txManager,
        config,
      );

      await useCase.execute(input());

      expect(subscriptions.saved[0].merchantProfileKey).toBe('BRL_ASAAS_SANDBOX');
    });
  });

  describe('exempt tenants', () => {
    it('makes a tenant whose registration is exempt ACTIVE and exempt with open-ended items', async () => {
      const registrationId = await reserve(
        new SignupRegistrationBuilder().asOperator().withExempt().build(),
      );

      await useCase.execute(input({ registrationId }));

      const [subscription] = subscriptions.saved;
      expect(subscription.status).toBe('ACTIVE');
      expect(subscription.exempt).toBe(true);
      expect(subscription.trialEndsAt).toBeNull();
      expect(subscription.nextDueDate).toBeNull();
      expect(subscription.items).toHaveLength(FEATURE_KEYS.length);
    });

    it("makes Ikaro's own tenant (slug = PLATFORM_OWNER_TENANT_SLUG) exempt without a registration flag", async () => {
      const registrationId = await reserve(new SignupRegistrationBuilder().asOperator().build());

      await useCase.execute(input({ slug: OWNER_SLUG, registrationId }));

      expect(subscriptions.saved[0].exempt).toBe(true);
      expect(subscriptions.saved[0].status).toBe('ACTIVE');
    });

    it('does not make an ordinary tenant exempt when no owner slug is configured', async () => {
      config = { appEnv: 'local', platformOwnerSlug: null };
      useCase = new CreateTrialSubscriptionUseCase(
        subscriptions,
        accounts,
        registrations,
        prices,
        inbox,
        txManager,
        config,
      );

      await useCase.execute(input({ slug: OWNER_SLUG }));

      expect(subscriptions.saved[0].exempt).toBe(false);
    });

    it('creates an exempt subscription in a country with no price rows, using the country default currency', async () => {
      const registrationId = await reserve(
        new SignupRegistrationBuilder().asOperator().withExempt().build(),
      );

      await expect(
        useCase.execute(input({ countryCode: 'US', timezone: 'America/New_York', registrationId })),
      ).resolves.toEqual({ created: true });

      expect(subscriptions.saved[0].currency).toBe('USD');
    });
  });

  describe('the billing account and the registration', () => {
    it('copies a self-signup tax id and terms to the account, signed by the admin email, and completes the registration', async () => {
      const tenantId = uuidv7();
      const taxId = TaxId.create(CPF, countrySpec('BR').taxId);
      const registration = new SignupRegistrationBuilder().withTaxId(taxId).build();
      const registrationId = await reserve(registration);

      await useCase.execute(input({ tenantId, registrationId, adminEmail: 'google@lavacar.com' }));

      const [account] = accounts.saved;
      expect(account.tenantId).toBe(tenantId);
      expect(account.taxId?.value).toBe('52998224725');
      expect(account.acceptedTerms).toEqual({
        version: registration.terms?.version,
        acceptedAt: registration.terms?.acceptedAt,
        acceptedBy: 'google@lavacar.com',
      });
      const completed = await registrations.findById(registrationId);
      expect(completed).toMatchObject({ status: 'COMPLETED', tenantId, taxId: null });
      // The Google sub stays on the registration (the eligibility rule reads it); the account has none.
      expect(completed?.googleSub).toBe(registration.googleSub);
      expect(account).not.toHaveProperty('googleSub');
    });

    it('builds the account without a tax id for an operator registration that has none (A7)', async () => {
      const registrationId = await reserve(new SignupRegistrationBuilder().asOperator().build());

      await expect(useCase.execute(input({ registrationId }))).resolves.toEqual({ created: true });

      expect(accounts.saved[0].taxId).toBeNull();
      expect(accounts.saved[0].acceptedTerms).toBeNull();
    });

    it('keeps an operator-given tax id on the account and clears it from the registration', async () => {
      const taxId = TaxId.create(CPF, countrySpec('BR').taxId);
      const registrationId = await reserve(
        new SignupRegistrationBuilder().asOperator().withTaxId(taxId).build(),
      );

      await useCase.execute(input({ registrationId }));

      expect(accounts.saved[0].taxId?.value).toBe('52998224725');
      expect((await registrations.findById(registrationId))?.taxId).toBeNull();
    });

    it('starts a default trial with no tax id and not exempt when there is no registration (the M26 repair)', async () => {
      await expect(
        useCase.execute(input({ registrationId: undefined, eventId: undefined })),
      ).resolves.toEqual({ created: true });

      expect(subscriptions.saved[0].status).toBe('TRIALING');
      expect(accounts.saved[0].taxId).toBeNull();
    });
  });

  describe('idempotency', () => {
    it('does nothing for a redelivered event: the inbox answers first (A1)', async () => {
      const registrationId = await reserve(new SignupRegistrationBuilder().asOperator().build());
      const request = input({ registrationId });
      await useCase.execute(request);

      await expect(useCase.execute(request)).resolves.toEqual({ created: false });

      expect(subscriptions.saved).toHaveLength(1);
      expect(accounts.saved).toHaveLength(1);
    });

    it('does nothing when the tenant already has a subscription, even for a new event id (A1)', async () => {
      const tenantId = uuidv7();
      await useCase.execute(input({ tenantId }));

      await expect(useCase.execute(input({ tenantId, eventId: uuidv7() }))).resolves.toEqual({
        created: false,
      });

      expect(subscriptions.saved).toHaveLength(1);
    });

    it('marks the event processed in the same transaction as the work', async () => {
      const request = input();

      await useCase.execute(request);

      expect(txManager.runCallCount).toBe(1);
      await expect(
        inbox.hasBeenProcessed(
          request.eventId as string,
          CreateTrialSubscriptionUseCase.CONSUMER_NAME,
        ),
      ).resolves.toBe(true);
    });

    it('marks nothing when there is no event id (the M26 repair has none)', async () => {
      await useCase.execute(input({ eventId: undefined }));

      expect(subscriptions.saved).toHaveLength(1);
      await expect(
        inbox.hasBeenProcessed('anything', CreateTrialSubscriptionUseCase.CONSUMER_NAME),
      ).resolves.toBe(false);
    });
  });

  describe('failures leave nothing behind', () => {
    it('fails loudly when the country has no price rows, creating nothing (A2)', async () => {
      const registrationId = await reserve(new SignupRegistrationBuilder().asOperator().build());
      const request = input({
        countryCode: 'US',
        timezone: 'America/New_York',
        registrationId,
      });

      await expect(useCase.execute(request)).rejects.toThrow(FeaturePriceNotFoundError);

      expect(subscriptions.saved).toHaveLength(0);
      expect(accounts.saved).toHaveLength(0);
      expect((await registrations.findById(registrationId))?.status).toBe('RESERVED');
      await expect(
        inbox.hasBeenProcessed(
          request.eventId as string,
          CreateTrialSubscriptionUseCase.CONSUMER_NAME,
        ),
      ).resolves.toBe(false);
    });

    it('refuses an unknown registration id and attaches nothing (A8)', async () => {
      await expect(useCase.execute(input({ registrationId: uuidv7() }))).rejects.toThrow(
        SignupRegistrationNotAvailableError,
      );

      expect(subscriptions.saved).toHaveLength(0);
      expect(accounts.saved).toHaveLength(0);
    });

    it('refuses a registration already COMPLETED for another tenant: nothing is created and the first tenant keeps it (A8)', async () => {
      const firstTenant = uuidv7();
      const registrationId = await reserve(new SignupRegistrationBuilder().asOperator().build());
      await useCase.execute(input({ tenantId: firstTenant, registrationId }));
      const secondTenant = uuidv7();

      await expect(
        useCase.execute(input({ tenantId: secondTenant, registrationId })),
      ).rejects.toThrow(SignupRegistrationNotAvailableError);

      expect(subscriptions.saved.map((row) => row.tenantId)).toEqual([firstTenant]);
      expect(accounts.saved.map((row) => row.tenantId)).toEqual([firstTenant]);
      expect((await registrations.findById(registrationId))?.tenantId).toBe(firstTenant);
    });
  });
});
