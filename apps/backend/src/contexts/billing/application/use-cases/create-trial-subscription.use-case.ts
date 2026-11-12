import { Inject, Injectable } from '@nestjs/common';
import { IInboxRepository, INBOX_REPOSITORY } from '../../../../shared/ports/inbox.port';
import {
  ITransactionManager,
  TRANSACTION_MANAGER,
} from '../../../../shared/ports/transaction-manager.port';
import { CountryCode } from '../../../../shared/value-objects/country-code.vo';
import { BillingAccount } from '../../domain/billing-account.aggregate';
import {
  FeaturePriceNotFoundError,
  SignupRegistrationNotAvailableError,
} from '../../domain/errors/billing-domain.error';
import { resolveMerchantProfileKey } from '../../domain/merchant-profile-key';
import type { SignupRegistration } from '../../domain/signup-registration';
import { Subscription } from '../../domain/subscription.aggregate';
import {
  BILLING_PROVISIONING_CONFIG,
  BillingProvisioningConfig,
} from '../ports/billing-provisioning-config.port';
import {
  BILLING_ACCOUNT_REPOSITORY,
  IBillingAccountRepository,
} from '../ports/billing-account-repository.port';
import {
  FEATURE_PRICE_REPOSITORY,
  IFeaturePriceRepository,
} from '../ports/feature-price-repository.port';
import {
  ISignupRegistrationRepository,
  SIGNUP_REGISTRATION_REPOSITORY,
} from '../ports/signup-registration-repository.port';
import {
  ISubscriptionRepository,
  SUBSCRIPTION_REPOSITORY,
} from '../ports/subscription-repository.port';

export interface CreateTrialSubscriptionUseCaseInput {
  tenantId: string;
  slug: string;
  countryCode: string;
  timezone: string;
  /** The first manager's address: the signing user's email for a `SELF_SIGNUP` registration. */
  adminEmail: string;
  /** The tenant's provisioning instant (ISO-8601), the start of its trial: never the wall clock. */
  occurredAt: string;
  correlationId: string;
  /** The Billing registration holding the billing intent; absent only for M26's repair (a default trial). */
  registrationId?: string;
  /** The `TenantProvisioned` event id: the inbox dedup key. Absent for M26's repair, which has no event. */
  eventId?: string;
}

export interface CreateTrialSubscriptionUseCaseResult {
  /** `false` when the event was already processed or the tenant already had a subscription. */
  created: boolean;
}

/**
 * Billing starts the subscription of a freshly provisioned tenant (UC-110): a `TRIALING` one with
 * the default paid items, or an `ACTIVE`, exempt one for Ikaro's own tenant and for a registration
 * that says so. Idempotent twice over: the shared inbox skips a redelivered event, and an existing
 * subscription (`UNIQUE(tenant_id)`) makes the use case a no-op. The registration is completed in
 * the same transaction, so it can never be attached to a second tenant.
 */
@Injectable()
export class CreateTrialSubscriptionUseCase {
  static readonly CONSUMER_NAME = 'create-trial-subscription';

  constructor(
    @Inject(SUBSCRIPTION_REPOSITORY) private readonly subscriptions: ISubscriptionRepository,
    @Inject(BILLING_ACCOUNT_REPOSITORY) private readonly accounts: IBillingAccountRepository,
    @Inject(SIGNUP_REGISTRATION_REPOSITORY)
    private readonly registrations: ISignupRegistrationRepository,
    @Inject(FEATURE_PRICE_REPOSITORY) private readonly prices: IFeaturePriceRepository,
    @Inject(INBOX_REPOSITORY) private readonly inbox: IInboxRepository,
    @Inject(TRANSACTION_MANAGER) private readonly txManager: ITransactionManager,
    @Inject(BILLING_PROVISIONING_CONFIG) private readonly config: BillingProvisioningConfig,
  ) {}

  async execute(
    input: CreateTrialSubscriptionUseCaseInput,
  ): Promise<CreateTrialSubscriptionUseCaseResult> {
    const { tenantId, eventId } = input;

    if (
      eventId &&
      (await this.inbox.hasBeenProcessed(eventId, CreateTrialSubscriptionUseCase.CONSUMER_NAME))
    ) {
      return { created: false };
    }
    if (await this.subscriptions.findByTenantId(tenantId)) return { created: false };

    const registration = await this.loadReservedRegistration(input.registrationId);
    const countryCode = CountryCode.create(input.countryCode);
    const exempt = registration?.exempt === true || input.slug === this.config.platformOwnerSlug;

    const startInput = {
      tenantId,
      countryCode,
      // An exempt subscription is never charged, so a country without a price list still gets one.
      currency: exempt ? countryCode.spec.currency : await this.currencyOf(countryCode),
      timezone: input.timezone,
      merchantProfileKey: resolveMerchantProfileKey(this.config.appEnv, countryCode.value),
      start: new Date(input.occurredAt),
    };
    const subscription = exempt
      ? Subscription.startExempt(startInput)
      : Subscription.startTrial(startInput);
    const account = this.buildAccount(input, countryCode, registration);

    await this.txManager.run(async () => {
      await this.subscriptions.save(subscription);
      await this.accounts.save(account);
      if (registration) {
        await this.registrations.complete(registration.complete(tenantId));
      }
      if (eventId)
        await this.inbox.markProcessed(eventId, CreateTrialSubscriptionUseCase.CONSUMER_NAME);
    });

    return { created: true };
  }

  // UC-110 A8: an unknown registration, or one already COMPLETED for another tenant (a redelivery
  // for this tenant never gets here: the inbox or the existing subscription answers first).
  private async loadReservedRegistration(
    registrationId: string | undefined,
  ): Promise<SignupRegistration | null> {
    if (registrationId === undefined) return null;
    const registration = await this.registrations.findById(registrationId);
    if (registration === null || registration.status !== 'RESERVED') {
      throw new SignupRegistrationNotAvailableError(registrationId);
    }
    return registration;
  }

  // UC-110 A2: a missing price list fails loudly; the message is retried and the operator sees it.
  private async currencyOf(countryCode: CountryCode): Promise<string> {
    const [first] = await this.prices.listSelectableByCountry(countryCode);
    if (first === undefined) {
      throw new FeaturePriceNotFoundError(
        `No feature prices exist for country ${countryCode.value}`,
      );
    }
    return first.currency;
  }

  // `requireTaxId` is true only for a self-signup (its flow already demanded a BR tax id); an
  // operator's registration may carry none (UC-110 A7) and an exempt tenant never needs one.
  private buildAccount(
    input: CreateTrialSubscriptionUseCaseInput,
    countryCode: CountryCode,
    registration: SignupRegistration | null,
  ): BillingAccount {
    const selfSignup = registration?.source === 'SELF_SIGNUP';
    return BillingAccount.create({
      tenantId: input.tenantId,
      countryCode,
      taxId: registration?.taxId ?? null,
      requireTaxId: selfSignup,
      acceptedTerms: registration?.terms
        ? {
            version: registration.terms.version,
            acceptedAt: registration.terms.acceptedAt,
            acceptedBy: selfSignup ? input.adminEmail : null,
          }
        : null,
    });
  }
}
