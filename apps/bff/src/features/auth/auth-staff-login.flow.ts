import { HttpException, HttpStatus } from '@nestjs/common';
import { Response } from 'express';
import { BackendHttpService } from '../../shared/http/backend-http.service';
import { GoogleProfile } from '../../shared/auth/google-profile';
import { JwtIssuerService } from './jwt-issuer.service';
import { issueStaffToken } from './token-assembly';
import { SESSION_COOKIE_NAME } from './session-cookie';
import { JWT_COOKIE_OPTIONS } from './cookie-options';
import { LinkGoogleAccountResponse, StaffByEmailResponse } from './auth.types';
import { authLoginLogger, findTenantBySlug } from './auth-login-shared';

// Split out of auth-controller-flow.service.ts to keep it under the file-length cap — the
// staff half of handleGoogleCallback's Google OAuth flow.

type StaffLoginFailureReason = 'email-mismatch' | 'staff-deactivated' | 'account-linked-elsewhere';

export async function handleStaffLogin(
  backendHttp: BackendHttpService,
  jwtIssuer: JwtIssuerService,
  profile: GoogleProfile,
  tenantSlug: string,
  res: Response,
  frontendUrl: string,
): Promise<void> {
  const tenantInfo = await findTenantBySlug(backendHttp, tenantSlug);
  if (!tenantInfo) {
    res.redirect(`${frontendUrl}/auth/error?reason=tenant-not-found`);
    return;
  }

  const staffByEmail = await findStaffByEmail(backendHttp, profile.email, tenantInfo.id);
  if (!staffByEmail) {
    redirectStaffLoginError(res, frontendUrl, 'invite-not-found', tenantSlug);
    return;
  }

  if (!staffByEmail.isActive) {
    redirectStaffLoginError(res, frontendUrl, 'staff-deactivated', tenantSlug);
    return;
  }

  const linkFailure = await linkStaffAccountIfNeeded(
    backendHttp,
    profile,
    staffByEmail,
    tenantInfo.id,
  );
  if (linkFailure) {
    redirectStaffLoginError(res, frontendUrl, linkFailure, tenantSlug);
    return;
  }

  const token = issueStaffToken(jwtIssuer, staffByEmail, tenantInfo, profile.name);
  res.cookie(SESSION_COOKIE_NAME, token, JWT_COOKIE_OPTIONS);
  authLoginLogger.log('Staff login', { tenantId: tenantInfo.id, staffId: staffByEmail.staffId });
  res.redirect(`${frontendUrl}/dashboard`);
}

async function findStaffByEmail(
  backendHttp: BackendHttpService,
  email: string,
  tenantId: string,
): Promise<StaffByEmailResponse | null> {
  return backendHttp
    .get<StaffByEmailResponse>('/internal/staff/by-email', { email, tenantId })
    .catch((err: unknown) => {
      if (err instanceof HttpException && err.getStatus() === HttpStatus.NOT_FOUND) return null;
      throw err;
    });
}

async function linkStaffAccountIfNeeded(
  backendHttp: BackendHttpService,
  profile: GoogleProfile,
  staffByEmail: StaffByEmailResponse,
  tenantId: string,
): Promise<StaffLoginFailureReason | null> {
  if (staffByEmail.googleOAuthId === profile.googleOAuthId) return null;

  try {
    await backendHttp.post<LinkGoogleAccountResponse>(
      `/internal/staff/${staffByEmail.staffId}/link-google`,
      {
        tenantId,
        googleOAuthId: profile.googleOAuthId,
        email: profile.email,
        name: profile.name,
      },
    );
    return null;
  } catch (err) {
    return mapStaffLinkError(err);
  }
}

function mapStaffLinkError(err: unknown): StaffLoginFailureReason {
  if (err instanceof HttpException && err.getStatus() === HttpStatus.UNPROCESSABLE_ENTITY) {
    return 'email-mismatch';
  }
  if (err instanceof HttpException && err.getStatus() === HttpStatus.FORBIDDEN) {
    return 'staff-deactivated';
  }
  if (err instanceof HttpException && err.getStatus() === HttpStatus.CONFLICT) {
    return 'account-linked-elsewhere';
  }
  throw err;
}

function redirectStaffLoginError(
  res: Response,
  frontendUrl: string,
  reason: string,
  tenantSlug: string,
): void {
  const slugParam = `&tenantSlug=${encodeURIComponent(tenantSlug)}`;
  res.redirect(`${frontendUrl}/auth/error?reason=${reason}${slugParam}`);
}
