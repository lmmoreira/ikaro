import { Inject, Injectable } from '@nestjs/common';
import { STALE_SIGNUP_RESERVATION_HOURS } from '../../domain/billing-constants';
import {
  ISignupRegistrationRepository,
  SIGNUP_REGISTRATION_REPOSITORY,
} from '../ports/signup-registration-repository.port';

export interface ReleaseStaleSignupRegistrationsUseCaseInput {
  now: Date;
}

export interface ReleaseStaleSignupRegistrationsUseCaseResult {
  released: number;
}

/**
 * UC-140 step 1b, the backstop of the signup's own immediate release: a `RESERVED` registration
 * older than one hour (an orphan left by a failed signup step, or an operator provisioning that
 * never completed) is deleted, so the Google account's trial is not blocked by it. A younger row,
 * and a `COMPLETED` one, stay. A tenant created from an operator registration that expired before
 * the Billing handler completed it is repaired as a default trial by the repair step; the operator
 * uses UC-137 if it was meant to be exempt.
 */
@Injectable()
export class ReleaseStaleSignupRegistrationsUseCase {
  constructor(
    @Inject(SIGNUP_REGISTRATION_REPOSITORY)
    private readonly registrations: ISignupRegistrationRepository,
  ) {}

  async execute(
    input: ReleaseStaleSignupRegistrationsUseCaseInput,
  ): Promise<ReleaseStaleSignupRegistrationsUseCaseResult> {
    const cutoff = new Date(input.now.getTime() - STALE_SIGNUP_RESERVATION_HOURS * 3_600_000);
    return { released: await this.registrations.releaseExpiredReservations(cutoff) };
  }
}
