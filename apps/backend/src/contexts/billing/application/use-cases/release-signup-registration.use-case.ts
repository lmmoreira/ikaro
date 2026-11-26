import { Inject, Injectable } from '@nestjs/common';
import {
  ISignupRegistrationRepository,
  SIGNUP_REGISTRATION_REPOSITORY,
} from '../ports/signup-registration-repository.port';

export interface ReleaseSignupRegistrationUseCaseInput {
  registrationId: string;
}

export interface ReleaseSignupRegistrationUseCaseResult {
  /** `false` when nothing was deleted: unknown id, already released, or already `COMPLETED`. */
  released: boolean;
}

/**
 * Deletes a `RESERVED` registration that was reserved and then abandoned: the BFF's self-signup
 * (UC-127) or the operator script's (`scripts/provision-tenant.sh`). One
 * conditional delete, so it is idempotent and can never remove a registration a tenant exists for
 * (a `COMPLETED` row matches nothing). The one-hour sweep (UC-140) stays the backstop.
 */
@Injectable()
export class ReleaseSignupRegistrationUseCase {
  constructor(
    @Inject(SIGNUP_REGISTRATION_REPOSITORY)
    private readonly registrations: ISignupRegistrationRepository,
  ) {}

  async execute(
    input: ReleaseSignupRegistrationUseCaseInput,
  ): Promise<ReleaseSignupRegistrationUseCaseResult> {
    return { released: await this.registrations.deleteReserved(input.registrationId) };
  }
}
