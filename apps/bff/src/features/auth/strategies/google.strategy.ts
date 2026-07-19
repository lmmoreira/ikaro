import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { Request } from 'express';
import { Profile, Strategy } from 'passport-google-oauth20';
import { OAUTH_NONCE_COOKIE_NAME } from '../cookie-options';
import { OAuthStateService } from '../oauth-state.service';

export interface GoogleProfile {
  googleOAuthId: string;
  email: string;
  name: string;
  tenantSlug?: string;
  loginType?: 'staff';
}

// No cookie-parser middleware is installed — mirrors JwtStrategy's extractFromCookie
// (strategies/jwt.strategy.ts), which reads req.headers.cookie the same way.
function extractCookie(req: Request, name: string): string | undefined {
  const raw = req?.headers?.cookie ?? '';
  const match = new RegExp(String.raw`(?:^|;\s*)${name}=([^;]+)`).exec(raw);
  return match ? decodeURIComponent(match[1]) : undefined;
}

@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
  constructor(
    config: ConfigService,
    private readonly oauthState: OAuthStateService,
  ) {
    super({
      clientID: config.getOrThrow<string>('GOOGLE_CLIENT_ID'),
      clientSecret: config.getOrThrow<string>('GOOGLE_CLIENT_SECRET'),
      callbackURL: config.getOrThrow<string>('GOOGLE_CALLBACK_URL'),
      scope: ['email', 'profile'],
      passReqToCallback: true,
    });
  }

  validate(
    req: Request,
    _accessToken: string,
    _refreshToken: string,
    profile: Profile,
    done: (error: Error | null, user?: GoogleProfile) => void,
  ): void {
    const email = profile.emails?.[0]?.value;
    if (!email) {
      done(new Error('Google account did not provide an email address'));
      return;
    }
    const raw = req.query['state'];
    const state = typeof raw === 'string' ? raw : '';
    const cookieNonce = extractCookie(req, OAUTH_NONCE_COOKIE_NAME);
    let loginType: 'staff' | undefined;
    let tenantSlug: string | undefined;
    try {
      ({ loginType, tenantSlug } = this.oauthState.decodeOAuthState(state, cookieNonce));
    } catch (err) {
      done(err as Error);
      return;
    }
    done(null, {
      googleOAuthId: profile.id,
      email,
      name: profile.displayName,
      tenantSlug,
      loginType,
    });
  }
}
