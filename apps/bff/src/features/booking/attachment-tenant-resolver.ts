import { HttpStatus } from '@nestjs/common';
import { BffErrorCode } from '@ikaro/types';
import { BackendHttpService } from '../../shared/http/backend-http.service';
import { throwProblemDetail } from '../../shared/http/problem-detail';
import { withPublicTenant } from '../../shared/http/public-tenant';
import { decodeUserJwt } from '../../shared/auth/decode-user-jwt';
import { verifyGuestToken } from './guest-token.util';

export interface AttachmentTenantResolutionInput {
  authHeader: string | undefined;
  guestToken: string | undefined;
  tenantSlug: string | undefined;
  jwtSecret: string;
}

/**
 * Resolves which tenant an attachment upload belongs to, from one of 3 mutually exclusive
 * scenarios — this route is @Public() (JwtAuthGuard doesn't run), so tenant identity must be
 * derived manually here:
 * 1. JWT present (authenticated CUSTOMER or STAFF/MANAGER) — tenant comes from the decoded JWT.
 * 2. guestToken present — tenant comes from verifying the guest token.
 * 3. Neither — anonymous guest, tenant resolved from tenantSlug.
 */
export async function resolveTenantIdForAttachmentUpload(
  backendHttp: BackendHttpService,
  { authHeader, guestToken, tenantSlug, jwtSecret }: AttachmentTenantResolutionInput,
): Promise<string> {
  // Scenario 1 (CUSTOMER) or Scenario 4 (STAFF/MANAGER) — JWT identifies the tenant.
  const user = decodeUserJwt(authHeader, jwtSecret);
  if (user) {
    return user.tenantId;
  }

  // Scenario 3 — guest with guestToken, tenant resolved from the token
  if (guestToken) {
    const tokenPayload = verifyGuestToken(guestToken, jwtSecret);
    if (!tokenPayload) {
      throw throwProblemDetail(
        HttpStatus.UNAUTHORIZED,
        BffErrorCode.GUEST_TOKEN_INVALID,
        'Invalid or expired guest token',
      );
    }
    return tokenPayload.tenantId;
  }

  // Scenario 2 — anonymous guest, tenantSlug in body
  return withPublicTenant(backendHttp, tenantSlug, (tenantId) => Promise.resolve(tenantId));
}
