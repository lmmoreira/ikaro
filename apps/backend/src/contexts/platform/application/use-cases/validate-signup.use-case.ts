import { Inject, Injectable } from '@nestjs/common';
import {
  SignupSlugInvalidError,
  SignupSlugTakenError,
  SignupTurnstileFailedError,
} from '../../domain/errors/signup-domain.error';
import { SlugReservedError } from '../../domain/errors/platform-domain.error';
import { SLUG_POLICY, SlugPolicy } from '../../domain/slug-policy';
import { ITenantRepository, TENANT_REPOSITORY } from '../ports/tenant-repository.port';
import {
  CLOUDFLARE_TURNSTILE_PROVIDER,
  ITurnstileVerifierPort,
} from '../ports/turnstile-verifier.port';

export interface ValidateSignupUseCaseInput {
  slug: string;
  /** The widget's single-use token; verified here and nowhere else in the signup flow. */
  turnstileToken: string;
  /** The visitor's real IP as the BFF resolved it (the backend only sees the BFF's connection). */
  clientIp: string;
}

/**
 * The stateless first call of a signup (UC-127 step 1). It persists nothing and checks only what
 * Platform owns: the slug (policy and a non-binding availability read) and Turnstile. The tax id
 * and the Terms version belong to Billing and are checked once, at the reservation. The cheap slug
 * checks run first, so a typo does not spend the visitor's single-use Turnstile token; Turnstile
 * still runs before the BFF reserves anything, so a bot cannot spam the reservation lock.
 * The verification is a network call and runs outside any transaction.
 */
@Injectable()
export class ValidateSignupUseCase {
  constructor(
    @Inject(SLUG_POLICY) private readonly slugPolicy: SlugPolicy,
    @Inject(TENANT_REPOSITORY) private readonly tenantRepo: ITenantRepository,
    @Inject(CLOUDFLARE_TURNSTILE_PROVIDER) private readonly turnstile: ITurnstileVerifierPort,
  ) {}

  async execute(input: ValidateSignupUseCaseInput): Promise<void> {
    // The owner slug is always reserved here: only the operator path may provision it.
    const verdict = this.slugPolicy.validate(input.slug, { allowOwnerSlug: false });
    if (verdict.kind === 'invalid') throw new SignupSlugInvalidError(input.slug, verdict.reason);
    if (verdict.kind === 'reserved') throw new SlugReservedError(input.slug);
    if (await this.tenantRepo.existsBySlug(input.slug)) throw new SignupSlugTakenError(input.slug);

    const verified = await this.turnstile.verify(input.turnstileToken, input.clientIp);
    if (!verified) throw new SignupTurnstileFailedError();
  }
}
