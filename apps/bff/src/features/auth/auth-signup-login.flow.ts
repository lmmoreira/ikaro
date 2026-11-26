import { ConfigService } from '@nestjs/config';
import { Response } from 'express';
import { GoogleProfile } from '../../shared/auth/google-profile';
import { validateDevAuthEnabled } from './auth-dev-login.flow';
import { DevSignupSessionDto } from './dtos/dev-signup-session.dto';
import { SignupSessionService } from './signup-session.service';

// Split out of auth-controller-flow.service.ts, like the staff, tenant and dev flows: the self-signup
// half of the Google callback (UC-127). No tenant exists yet, so nothing here calls the backend and
// no tenant JWT is issued; the only output is the short-lived signup-session cookie.

/**
 * The callback of the self-signup Google step. An unverified Google email is refused (it becomes
 * the first manager's address); otherwise the verified identity goes into the signup cookie and the
 * browser lands on the form step. The redirect targets are fixed (the S33 pages), never read from
 * the request: this branch is outside the slug-bound `returnTo` path.
 */
export function handleSignupLogin(
  signupSessions: SignupSessionService,
  profile: GoogleProfile,
  res: Response,
  frontendUrl: string,
): void {
  if (!profile.emailVerified) {
    res.redirect(`${frontendUrl}/ikaro-trial/conta-nao-verificada`);
    return;
  }
  signupSessions.issueSession(res, {
    email: profile.email,
    name: profile.name,
    googleSub: profile.googleOAuthId,
  });
  res.redirect(`${frontendUrl}/ikaro-trial/entrar`);
}

/** Dev/test only: sets the same cookie without Google, gated exactly like `dev-login`. */
export function devSignupSession(
  signupSessions: SignupSessionService,
  config: ConfigService,
  dto: DevSignupSessionDto,
  res: Response,
): { ok: true } {
  validateDevAuthEnabled(config);
  signupSessions.issueSession(res, {
    email: dto.email,
    name: dto.name,
    googleSub: dto.googleSub,
  });
  return { ok: true };
}
