import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Request } from 'express';
import { JwtRole } from '../../features/auth/jwt-issuer.service';
import { GoogleProfile } from '../../features/auth/strategies/google.strategy';

export interface CurrentUserPayload {
  sub: string;
  tenantId: string;
  tenantSlug: string;
  tenantName: string;
  userName: string | null;
  role: JwtRole;
  locale: string;
}

// req.user is populated by whichever Passport strategy authenticated the request: JwtStrategy
// (CurrentUserPayload) for JWT-bearing routes, GoogleStrategy (GoogleProfile) only during the
// /auth/google/callback OAuth handoff before a JWT has been issued yet. No single request is
// ever authenticated by both. @types/passport already declares Express.Request.user itself
// (as its own extensible, empty `Express.User`), so a second global augmentation here can't
// cleanly override it — this repo's skipLibCheck:true silently drops the conflicting override
// instead of erroring, so every consumer goes through this one accessor instead.
// GoogleProfile never carries `sub` (JWT payloads do) — the one field that reliably tells the
// two shapes apart.
export function getCurrentUser(req: Request): CurrentUserPayload | undefined {
  const user = req.user as CurrentUserPayload | GoogleProfile | undefined;
  return user !== undefined && 'sub' in user ? user : undefined;
}

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): CurrentUserPayload | undefined => {
    const request = ctx.switchToHttp().getRequest<Request>();
    return getCurrentUser(request);
  },
);
