import { ExecutionContext, Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Request, Response } from 'express';
import { OAUTH_NONCE_COOKIE_NAME, OAUTH_NONCE_COOKIE_OPTIONS } from '../cookie-options';
import { OAuthStateService } from '../oauth-state.service';

@Injectable()
export class GoogleAuthGuard extends AuthGuard('google') {
  constructor(private readonly oauthState: OAuthStateService) {
    super();
  }

  // Sets the nonce cookie that binds this browser to the state JWT (double-submit pattern,
  // M17-S32) — GoogleStrategy.validate() compares it against the state's nonce on callback.
  // Applied only to /auth/google (initiation), never /auth/google/callback (that route uses
  // GoogleCallbackGuard instead) — generating a fresh state+nonce on the callback leg would
  // be pointless (Passport ignores options.state once a `code` is present) and would just
  // overwrite the cookie the callback still needs to read.
  getAuthenticateOptions(context: ExecutionContext): object {
    const req = context.switchToHttp().getRequest<Request>();
    const res = context.switchToHttp().getResponse<Response>();
    const tenantSlug = req.query['tenantSlug'] as string | undefined;
    const type = req.query['type'] === 'staff' ? 'staff' : 'customer';
    const { state, nonce } = this.oauthState.encodeOAuthState(type, tenantSlug);
    res.cookie(OAUTH_NONCE_COOKIE_NAME, nonce, OAUTH_NONCE_COOKIE_OPTIONS);
    return { state };
  }
}
