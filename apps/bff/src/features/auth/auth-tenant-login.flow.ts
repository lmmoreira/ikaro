import { ConfigService } from '@nestjs/config';
import { HttpStatus } from '@nestjs/common';
import { Response } from 'express';
import { BffErrorCode } from '@ikaro/types';
import { BackendHttpService } from '../../shared/http/backend-http.service';
import { throwProblemDetail } from '../../shared/http/problem-detail';
import { GoogleProfile } from '../../shared/auth/google-profile';
import { CurrentUserPayload } from '../../shared/decorators/current-user.decorator';
import { TenantInfoResponse } from '../../shared/types/backend-responses';
import { JwtIssuerService } from './jwt-issuer.service';
import { issueCustomerToken, issueStaffToken } from './token-assembly';
import { SESSION_COOKIE_NAME } from './session-cookie';
import { JWT_COOKIE_OPTIONS } from './cookie-options';
import { isValidSlug } from './oauth-state';
import { SwitchStaffTenantDto } from './dtos/switch-staff-tenant.dto';
import { SwitchTenantDto } from './dtos/switch-tenant.dto';
import {
  CustomerTenantSummaryResponse,
  FindOrCreateCustomerResponse,
  StaffInfoResponse,
  StaffTenantOption,
} from './auth.types';
import { authLoginLogger, findTenantBySlug } from './auth-login-shared';

// Split out of auth-controller-flow.service.ts (TD37-S05, file-length) — the customer half of
// handleGoogleCallback's Google OAuth flow, plus the logout/tenant-switching endpoints that
// share the same tenant-lookup/token-issuing shape.

export function logoutWithTenantSlug(
  config: ConfigService,
  tenantSlug: string | undefined,
  res: Response,
): void {
  res.clearCookie(SESSION_COOKIE_NAME, JWT_COOKIE_OPTIONS);
  const frontendUrl = config.getOrThrow<string>('FRONTEND_URL');
  const path = tenantSlug && isValidSlug(tenantSlug) ? `/${tenantSlug}` : '';
  res.redirect(`${frontendUrl}${path}`);
}

export async function getStaffTenants(
  backendHttp: BackendHttpService,
): Promise<StaffTenantOption[]> {
  const staffList = await backendHttp.get<StaffInfoResponse[]>('/staff/me/tenants');
  const activeStaff = staffList.filter((s) => s.isActive);
  if (activeStaff.length === 0) return [];

  const tenantIds = [...new Set(activeStaff.map((s) => s.tenantId))];
  const tenants = await backendHttp.get<TenantInfoResponse[]>(
    `/internal/tenants?ids=${tenantIds.join(',')}`,
  );
  const tenantMap = new Map(tenants.map((t) => [t.id, t]));

  return activeStaff.map((s) => {
    const tenantInfo = tenantMap.get(s.tenantId);
    if (!tenantInfo) {
      throw throwProblemDetail(
        HttpStatus.INTERNAL_SERVER_ERROR,
        BffErrorCode.TENANT_LOOKUP_INCONSISTENT,
        `Tenant ${s.tenantId} missing from batch response`,
      );
    }
    return {
      staffId: s.staffId,
      tenantId: s.tenantId,
      tenantSlug: tenantInfo.slug,
      tenantName: tenantInfo.name,
      role: s.role,
    };
  });
}

export async function switchStaffTenant(
  backendHttp: BackendHttpService,
  jwtIssuer: JwtIssuerService,
  config: ConfigService,
  dto: SwitchStaffTenantDto,
  currentUser: CurrentUserPayload,
  res: Response,
): Promise<{ tenantSlug: string; expiresIn: string }> {
  const staffList = await backendHttp.get<StaffInfoResponse[]>('/staff/me/tenants');
  const match = staffList.find((s) => s.staffId === dto.staffId && s.isActive);
  if (!match) {
    // Caller is already authenticated (switching between their own linked tenants) — not a
    // pre-auth prober, so a specific code doesn't create an enumeration risk (TD23 Story 11
    // security review).
    throw throwProblemDetail(
      HttpStatus.FORBIDDEN,
      BffErrorCode.STAFF_NOT_REGISTERED_IN_TENANT,
      'Staff record not found or not active',
    );
  }

  const tenantInfo = await backendHttp.get<TenantInfoResponse>(
    `/internal/tenants/${match.tenantId}`,
  );
  const accessToken = issueStaffToken(jwtIssuer, match, tenantInfo, currentUser.userName);

  res.cookie(SESSION_COOKIE_NAME, accessToken, JWT_COOKIE_OPTIONS);
  return {
    tenantSlug: tenantInfo.slug,
    expiresIn: config.getOrThrow<string>('JWT_EXPIRES_IN'),
  };
}

export async function switchTenant(
  backendHttp: BackendHttpService,
  jwtIssuer: JwtIssuerService,
  config: ConfigService,
  dto: SwitchTenantDto,
  currentUser: CurrentUserPayload,
  res: Response,
): Promise<{ tenantSlug: string; expiresIn: string }> {
  const tenants = await backendHttp.get<CustomerTenantSummaryResponse[]>('/customers/me/tenants');
  const match = tenants.find((t) => t.tenantId === dto.targetTenantId);
  if (!match) {
    // Caller is already authenticated (switching between their own linked tenants) — not a
    // pre-auth prober, so a specific code doesn't create an enumeration risk (TD23 Story 11
    // security review).
    throw throwProblemDetail(
      HttpStatus.FORBIDDEN,
      BffErrorCode.CUSTOMER_NOT_REGISTERED_IN_TENANT,
      'Customer is not registered in the target tenant',
    );
  }

  const tenantInfo = await backendHttp.get<TenantInfoResponse>(
    `/internal/tenants/${dto.targetTenantId}`,
  );
  const accessToken = issueCustomerToken(
    jwtIssuer,
    match.customerId,
    tenantInfo,
    currentUser.userName,
  );

  res.cookie(SESSION_COOKIE_NAME, accessToken, JWT_COOKIE_OPTIONS);
  return {
    tenantSlug: tenantInfo.slug,
    expiresIn: config.getOrThrow<string>('JWT_EXPIRES_IN'),
  };
}

export async function handleTenantLogin(
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

  const { customerId } = await backendHttp.post<FindOrCreateCustomerResponse>(
    '/internal/customers',
    {
      tenantId: tenantInfo.id,
      googleOAuthId: profile.googleOAuthId,
      email: profile.email,
      name: profile.name,
    },
  );

  const token = issueCustomerToken(jwtIssuer, customerId, tenantInfo, profile.name);
  res.cookie(SESSION_COOKIE_NAME, token, JWT_COOKIE_OPTIONS);
  authLoginLogger.log('Customer login', { tenantId: tenantInfo.id, customerId });
  res.redirect(`${frontendUrl}/${tenantInfo.slug}`);
}
