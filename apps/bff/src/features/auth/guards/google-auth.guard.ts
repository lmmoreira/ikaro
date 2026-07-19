import { ExecutionContext, HttpStatus, Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Request } from 'express';
import { BffErrorCode } from '@ikaro/types';
import { throwProblemDetail } from '../../../shared/http/problem-detail';
import { OAuthStateService } from '../oauth-state.service';

@Injectable()
export class GoogleAuthGuard extends AuthGuard('google') {
  constructor(private readonly oauthState: OAuthStateService) {
    super();
  }

  getAuthenticateOptions(context: ExecutionContext): object {
    const req = context.switchToHttp().getRequest<Request>();
    const tenantSlug = req.query['tenantSlug'] as string | undefined;
    if (req.query['type'] === 'staff') {
      return { state: this.oauthState.encodeOAuthState('staff', tenantSlug) };
    }
    return { state: this.oauthState.encodeOAuthState('customer', tenantSlug) };
  }

  // Only reached on /auth/google/callback — the initiation leg (/auth/google) redirects
  // to Google before Passport ever calls handleRequest. GoogleStrategy.validate() rejects
  // via done(err) when decodeOAuthState() throws (tampered/expired/missing state); this
  // turns that into a 400 Problem Detail instead of the framework's default 401 (mirrors
  // JwtAuthGuard's handleRequest override — shared/guards/jwt-auth.guard.ts).
  handleRequest<T>(err: Error | null, user: T): T {
    if (err || !user) {
      throw throwProblemDetail(
        HttpStatus.BAD_REQUEST,
        BffErrorCode.OAUTH_STATE_INVALID,
        'Invalid or expired OAuth state.',
      );
    }
    return user;
  }
}
