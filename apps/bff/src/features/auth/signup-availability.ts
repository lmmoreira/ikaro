import { HttpStatus } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { SignupErrorCode } from '@ikaro/types';
import { throwProblemDetail } from '../../shared/http/problem-detail';

/**
 * The signup kill switch (UC-127 A11). Unset means open everywhere but production, where it means
 * closed, so a production deploy that loses the variable fails closed.
 */
export function isSignupEnabled(config: ConfigService): boolean {
  const flag = config.get<boolean | undefined>('FEATURE_FLAG_SIGNUP_ENABLED');
  if (flag !== undefined) return flag;
  return config.get<string>('APP_ENV') !== 'production';
}

/** Throws `503 SIGNUP_CLOSED` while signup is closed; prices and slug availability never call it. */
export function assertSignupOpen(config: ConfigService): void {
  if (!isSignupEnabled(config)) {
    throw throwProblemDetail(
      HttpStatus.SERVICE_UNAVAILABLE,
      SignupErrorCode.CLOSED,
      'Signup is unavailable right now.',
    );
  }
}
