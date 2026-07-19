import { ExecutionContext, HttpStatus, Injectable, UnauthorizedException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Request, Response } from 'express';
import { BffErrorCode } from '@ikaro/types';
import { throwProblemDetail } from '../../../shared/http/problem-detail';
import { OAUTH_NONCE_COOKIE_NAME, OAUTH_NONCE_COOKIE_OPTIONS } from '../cookie-options';
import { OAuthStateInvalidError } from '../oauth-state';
import { OAuthStateService } from '../oauth-state.service';

@Injectable()
export class GoogleAuthGuard extends AuthGuard('google') {
  constructor(private readonly oauthState: OAuthStateService) {
    super();
  }

  // Sets the nonce cookie that binds this browser to the state JWT (double-submit pattern,
  // M17-S32) — GoogleStrategy.validate() compares it against the state's nonce on callback.
  getAuthenticateOptions(context: ExecutionContext): object {
    const req = context.switchToHttp().getRequest<Request>();
    const res = context.switchToHttp().getResponse<Response>();
    const tenantSlug = req.query['tenantSlug'] as string | undefined;
    const type = req.query['type'] === 'staff' ? 'staff' : 'customer';
    const { state, nonce } = this.oauthState.encodeOAuthState(type, tenantSlug);
    res.cookie(OAUTH_NONCE_COOKIE_NAME, nonce, OAUTH_NONCE_COOKIE_OPTIONS);
    return { state };
  }

  // Only reached on /auth/google/callback — the initiation leg (/auth/google) redirects
  // to Google before Passport ever calls handleRequest. GoogleStrategy.validate() rejects
  // via done(err) when decodeOAuthState() throws (tampered/expired/missing state, or a
  // nonce/cookie mismatch); only that specific failure (OAuthStateInvalidError) maps to a
  // 400 Problem Detail here (mirrors JwtAuthGuard's handleRequest override — shared/guards/
  // jwt-auth.guard.ts). Any other Passport failure (e.g. Google returning no email) keeps
  // the framework's default handling instead of being mislabeled as a state problem.
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
