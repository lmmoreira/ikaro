import { Inject, Injectable } from '@nestjs/common';
import { CURRENT_TERMS_VERSION } from '@ikaro/types';
import { countrySpec } from '@ikaro/i18n';
import { CLOCK, IClock } from '../../../../shared/ports/clock.port';
import {
  ITransactionManager,
  TRANSACTION_MANAGER,
} from '../../../../shared/ports/transaction-manager.port';
import { CountryCode } from '../../../../shared/value-objects/country-code.vo';
import { TaxId } from '../../../../shared/value-objects/tax-id.vo';
import { SIGNUP_SUPPORTED_COUNTRIES } from '../../domain/billing-constants';
import {
  SignupCountryNotSupportedError,
  SignupTermsNotAcceptedError,
} from '../../domain/errors/billing-domain.error';
import { SignupRegistration, type SignupSource } from '../../domain/signup-registration';
import { evaluateTrialEligibility } from '../../domain/trial-eligibility';
import {
  ISignupRegistrationLockPort,
  SIGNUP_REGISTRATION_LOCK,
} from '../ports/signup-registration-lock.port';
import {
  ISignupRegistrationRepository,
  SIGNUP_REGISTRATION_REPOSITORY,
} from '../ports/signup-registration-repository.port';

export interface ReserveSignupRegistrationUseCaseInput {
  source: SignupSource;
  /** Required for `SELF_SIGNUP`; ignored (never stored) for `OPERATOR`. */
  googleSub?: string;
  /**
   * Required for `SELF_SIGNUP`: must be in `SIGNUP_SUPPORTED_COUNTRIES` (UC-127 A7). It also picks
   * the `TaxId` spec, and is never stored.
   */
  countryCode?: string;
  /** The raw tax id; validated against `countryCode`'s `CountrySpec` (blank is `SIGNUP_TAX_ID_REQUIRED`). */
  taxId?: string;
  /** Required for `SELF_SIGNUP`; ignored (never stored) for `OPERATOR`. */
  termsVersion?: string;
  /** `OPERATOR` only: the tenant to be is provisioned free of charge. */
  exempt?: boolean;
}

export interface ReserveSignupRegistrationUseCaseResult {
  /** `null` when the trial is not available: nothing was reserved, so there is nothing to release. */
  registrationId: string | null;
  trialAvailable: boolean;
}

/**
 * Reserves the provisioning registration (UC-110, UC-127). `SELF_SIGNUP` runs the trial-eligibility
 * check under lock B-A1 and inserts nothing when it fails; `OPERATOR` skips both the lock and the
 * check (a trusted caller with no Google `sub` to protect) and always gets a fresh row.
 * Nothing here publishes an event: the Google `sub`, tax id and terms stay in the registration.
 */
@Injectable()
export class ReserveSignupRegistrationUseCase {
  constructor(
    @Inject(SIGNUP_REGISTRATION_REPOSITORY)
    private readonly registrations: ISignupRegistrationRepository,
    @Inject(SIGNUP_REGISTRATION_LOCK) private readonly lock: ISignupRegistrationLockPort,
    @Inject(TRANSACTION_MANAGER) private readonly txManager: ITransactionManager,
    @Inject(CLOCK) private readonly clock: IClock,
  ) {}

  async execute(
    input: ReserveSignupRegistrationUseCaseInput,
  ): Promise<ReserveSignupRegistrationUseCaseResult> {
    const taxId = this.checkSelfSignupRules(input);
    const registration = SignupRegistration.reserve({
      source: input.source,
      googleSub: input.googleSub,
      taxId,
      termsVersion: input.termsVersion,
      exempt: input.exempt,
      now: this.clock.now(),
    });

    if (input.source === 'OPERATOR' || registration.googleSub === null) {
      await this.txManager.run(() => this.registrations.save(registration));
      return { registrationId: registration.id, trialAvailable: true };
    }

    const googleSub = registration.googleSub;
    return this.txManager.run(async () => {
      await this.lock.lockSignupRegistration(googleSub);
      const history = await this.registrations.findGoogleSubHistory(googleSub);
      const taxIdHeldByUnpaid = taxId
        ? await this.registrations.isTaxIdHeldByUnpaid(taxId.value)
        : false;
      if (!evaluateTrialEligibility({ history, taxIdHeldByUnpaid })) {
        return { registrationId: null, trialAvailable: false };
      }
      await this.registrations.save(registration);
      return { registrationId: registration.id, trialAvailable: true };
    });
  }

  /**
   * What Billing owns about a signup, checked once and before the lock or any write (decided at
   * M26-S24 discovery): the country, the terms version and the tax id. An operator registration
   * carries a tax id only when the script sends one, and never a country rule.
   */
  private checkSelfSignupRules(input: ReserveSignupRegistrationUseCaseInput): TaxId | null {
    const selfSignup = input.source === 'SELF_SIGNUP';
    if (
      selfSignup &&
      !SIGNUP_SUPPORTED_COUNTRIES.includes(input.countryCode?.toUpperCase() ?? '')
    ) {
      // An unknown or malformed code is "not offered" too, so it never reaches the CountryCode VO.
      throw new SignupCountryNotSupportedError(input.countryCode ?? '');
    }
    const country = input.countryCode ? CountryCode.create(input.countryCode) : null;
    if (selfSignup) {
      // A missing version is `SIGNUP_TERMS_NOT_ACCEPTED` too (raised by the aggregate); a stale
      // or invented one is refused here, against the version the session read reported.
      if (input.termsVersion && input.termsVersion !== CURRENT_TERMS_VERSION) {
        throw new SignupTermsNotAcceptedError();
      }
    }
    if (!country) return null;
    const spec = countrySpec(country.value).taxId;
    return selfSignup || input.taxId !== undefined ? TaxId.createOptional(input.taxId, spec) : null;
  }
}
