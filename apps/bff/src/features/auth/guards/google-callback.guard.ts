import { HttpStatus, Injectable, UnauthorizedException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { BffErrorCode } from '@ikaro/types';
import { throwProblemDetail } from '../../../shared/http/problem-detail';
import { OAuthStateInvalidError } from '../oauth-state';

@Injectable()
export class GoogleCallbackGuard extends AuthGuard('google') {
  // GoogleStrategy.validate() rejects via done(err) when decodeOAuthState() throws
  // (tampered/expired/missing state, or a nonce/cookie mismatch); only that specific
  // failure (OAuthStateInvalidError) maps to a 400 Problem Detail here (mirrors
  // JwtAuthGuard's handleRequest override — shared/guards/jwt-auth.guard.ts). Any other
  // Passport failure (e.g. Google returning no email) keeps the framework's default
  // handling instead of being mislabeled as a state problem.
  handleRequest<T>(err: Error | null, user: T): T {
    if (err instanceof OAuthStateInvalidError) {
      throw throwProblemDetail(
        HttpStatus.BAD_REQUEST,
        BffErrorCode.OAUTH_STATE_INVALID,
        'Invalid or expired OAuth state.',
      );
    }
    if (err || !user) {
      throw err ?? new UnauthorizedException();
    }
    return user;
  }
}
