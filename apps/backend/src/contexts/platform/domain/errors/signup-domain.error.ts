import { SignupErrorCode } from '@ikaro/types/protocol/errors';
import { DomainErrorShape } from '../../../../shared/domain/domain-error-shape';

/**
 * The public signup's own answers (UC-127 A1, A2, M26-S24). They carry `SignupErrorCode` members,
 * not `PlatformErrorCode` ones: the operator route keeps `PLATFORM_SLUG_ALREADY_TAKEN` and the
 * Slug VO's `400`, and the public form gets the `SIGNUP_*` codes its field errors are keyed on.
 */
export class SignupSlugTakenError extends Error implements DomainErrorShape {
  readonly code = SignupErrorCode.SLUG_TAKEN;
  readonly field = 'slug';

  constructor(slug: string) {
    super(`Slug '${slug}' is already in use`);
    Object.setPrototypeOf(this, new.target.prototype);
    this.name = 'SignupSlugTakenError';
  }
}

export class SignupSlugInvalidError extends Error implements DomainErrorShape {
  readonly code = SignupErrorCode.SLUG_INVALID;
  readonly field = 'slug';

  constructor(
    slug: string,
    readonly reason: string,
  ) {
    super(`Slug '${slug}' is not a valid address (${reason})`);
    Object.setPrototypeOf(this, new.target.prototype);
    this.name = 'SignupSlugInvalidError';
  }
}

export class SignupTurnstileFailedError extends Error implements DomainErrorShape {
  readonly code = SignupErrorCode.TURNSTILE_FAILED;

  constructor() {
    super('The Turnstile verification failed');
    Object.setPrototypeOf(this, new.target.prototype);
    this.name = 'SignupTurnstileFailedError';
  }
}
