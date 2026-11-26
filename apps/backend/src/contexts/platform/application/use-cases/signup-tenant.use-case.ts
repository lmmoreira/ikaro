import { Injectable } from '@nestjs/common';
import { SignupSlugTakenError } from '../../domain/errors/signup-domain.error';
import { SlugAlreadyTakenError } from '../../domain/errors/platform-domain.error';
import {
  TenantProvisioningService,
  type TenantProvisioningResult,
} from '../services/tenant-provisioning.service';

export interface SignupTenantUseCaseInput {
  name: string;
  slug: string;
  /** The verified Google email: it becomes the first manager. */
  adminEmail: string;
  countryCode: string;
  /** The Billing registration the BFF reserved before this call (required, UC-127 step 2). */
  registrationId: string;
}

export type SignupTenantUseCaseResult = TenantProvisioningResult;

/**
 * Self-signup provisioning (UC-127 step 3): the public entry point over the same
 * `TenantProvisioningService` the operator route uses. It never owns a second copy of a rule: the
 * tax id and the Terms version were settled by Billing at the reservation, Turnstile was consumed
 * by `validate`, and the slug policy and the unique constraint are enforced by provisioning itself.
 * What it adds is the public vocabulary: Ikaro's own slug is never allowed, and a slug taken
 * between the availability check and the commit answers `SIGNUP_SLUG_TAKEN` instead of the
 * operator code.
 */
@Injectable()
export class SignupTenantUseCase {
  constructor(private readonly provisioning: TenantProvisioningService) {}

  async execute(input: SignupTenantUseCaseInput): Promise<SignupTenantUseCaseResult> {
    try {
      return await this.provisioning.provision({
        name: input.name,
        slug: input.slug,
        adminEmail: input.adminEmail,
        country_code: input.countryCode,
        registrationId: input.registrationId,
        allowOwnerSlug: false,
      });
    } catch (err: unknown) {
      if (err instanceof SlugAlreadyTakenError) throw new SignupSlugTakenError(input.slug);
      throw err;
    }
  }
}
