import { Inject, Injectable } from '@nestjs/common';
import { countrySpec } from '@ikaro/i18n';
import { CLOCK, IClock } from '../../../../shared/ports/clock.port';
import {
  ITransactionManager,
  TRANSACTION_MANAGER,
} from '../../../../shared/ports/transaction-manager.port';
import { CountryCode } from '../../../../shared/value-objects/country-code.vo';
import { TaxId } from '../../../../shared/value-objects/tax-id.vo';
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
  /** The country travels with the raw value only to pick the `TaxId` spec; it is never stored. */
  taxId?: { raw: string; countryCode: string };
  /** Required for `SELF_SIGNUP`; ignored (never stored) for `OPERATOR`. */
  termsVersion?: string;
}

export interface ReserveSignupRegistrationUseCaseResult {
  /** `null` when the trial is not available: nothing was reserved, so there is nothing to release. */
  registrationId: string | null;
  trialAvailable: boolean;
}

/**
 * Reserves the provisioning registration (UC-110, UC-127). `SELF_SIGNUP` runs the trial-eligibility
 * check under lock B-A1 and inserts nothing when it fails; `OPERATOR` skips both the lock and the
 * check (a trusted, exception path with no Google `sub` to protect) and always gets a fresh row.
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
    const taxId = input.taxId
      ? TaxId.create(
          input.taxId.raw,
          countrySpec(CountryCode.create(input.taxId.countryCode).value).taxId,
        )
      : null;
    const registration = SignupRegistration.reserve({
      source: input.source,
      googleSub: input.googleSub,
      taxId,
      termsVersion: input.termsVersion,
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
}
