// Shape Passport's GoogleStrategy populates req.user with during the /auth/google/callback
// handoff, before a JWT exists yet. Lives in shared/ (not features/auth/strategies/) because
// shared/decorators/current-user.decorator.ts needs it to distinguish this from
// CurrentUserPayload — shared/ code must not reach into features/ for its own type contracts.
export interface GoogleProfile {
  googleOAuthId: string;
  email: string;
  name: string;
  tenantSlug?: string;
  loginType?: 'staff';
  returnTo?: string;
}
