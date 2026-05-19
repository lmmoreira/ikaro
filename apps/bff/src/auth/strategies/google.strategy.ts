import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { Request } from 'express';
import { Profile, Strategy } from 'passport-google-oauth20';

export interface GoogleProfile {
  googleOAuthId: string;
  email: string;
  name: string;
  tenantSlug?: string;
  loginType?: 'staff';
}

@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
  constructor(config: ConfigService) {
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
    const state = (req.query['state'] as string) || '';
    // '__staff__' and '__staff__:<slug>' cannot be valid tenant slugs ([a-z0-9-]+ only)
    const SLUG_REGEX = /^[a-z0-9-]+$/;
    let loginType: 'staff' | undefined;
    let tenantSlug: string | undefined;
    if (state === '__staff__') {
      loginType = 'staff';
    } else if (state.startsWith('__staff__:')) {
      loginType = 'staff';
      const extracted = state.slice('__staff__:'.length);
      tenantSlug = extracted && SLUG_REGEX.test(extracted) ? extracted : undefined;
    } else {
      tenantSlug = state && SLUG_REGEX.test(state) ? state : undefined;
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
