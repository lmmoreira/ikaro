import { HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Response } from 'express';
import { ActorRole, BffErrorCode, GenericErrorCode } from '@ikaro/types';
import { BackendHttpService } from '../../shared/http/backend-http.service';
import { throwProblemDetail } from '../../shared/http/problem-detail';
import { TenantInfoResponse } from '../../shared/types/backend-responses';
import { JwtIssuerService } from './jwt-issuer.service';
import { issueCustomerToken, issueStaffToken } from './token-assembly';
import { SESSION_COOKIE_NAME } from './session-cookie';
import { JWT_COOKIE_OPTIONS } from './cookie-options';
import { DevLoginDto } from './dtos/dev-login.dto';
import {
  FindOrCreateCustomerResponse,
  LinkGoogleAccountResponse,
  StaffByEmailResponse,
  StaffInfoResponse,
} from './auth.types';

// Split out of auth-controller-flow.service.ts (TD37-S05, file-length) — the local-only dev-auth
// login flow (ENABLE_DEV_AUTH=true, never available in production).

interface DevActorResolution {
  actorId: string;
  role: ActorRole;
  accessToken: string;
}

export async function devLogin(
  backendHttp: BackendHttpService,
  jwtIssuer: JwtIssuerService,
  config: ConfigService,
  dto: DevLoginDto,
  res: Response,
): Promise<{
  accessToken: string;
  user: { sub: string; tenantId: string; tenantSlug: string; role: ActorRole };
}> {
  validateDevAuthEnabled(config);

  const tenantInfo = await backendHttp.get<TenantInfoResponse>(
    `/internal/tenants/by-slug/${encodeURIComponent(dto.tenantSlug)}`,
  );

  const { actorId, role, accessToken } =
    dto.type === 'staff'
      ? await resolveStaffDevActor(backendHttp, jwtIssuer, dto, tenantInfo)
      : await resolveCustomerDevActor(backendHttp, jwtIssuer, dto, tenantInfo);

  res.cookie(SESSION_COOKIE_NAME, accessToken, JWT_COOKIE_OPTIONS);

  return {
    accessToken,
    user: { sub: actorId, tenantId: tenantInfo.id, tenantSlug: tenantInfo.slug, role },
  };
}

function validateDevAuthEnabled(config: ConfigService): void {
  if (config.get<string>('ENABLE_DEV_AUTH') !== 'true') {
    throw throwProblemDetail(
      HttpStatus.FORBIDDEN,
      BffErrorCode.DEV_AUTH_UNAVAILABLE,
      'Dev auth is not enabled',
    );
  }
  if (config.get<'local' | 'staging' | 'production'>('APP_ENV', 'local') === 'production') {
    throw throwProblemDetail(
      HttpStatus.FORBIDDEN,
      BffErrorCode.DEV_AUTH_UNAVAILABLE,
      'Dev auth is not available in production',
    );
  }
}

async function resolveStaffDevActor(
  backendHttp: BackendHttpService,
  jwtIssuer: JwtIssuerService,
  dto: DevLoginDto,
  tenantInfo: TenantInfoResponse,
): Promise<DevActorResolution> {
  const staffList = await backendHttp.get<StaffInfoResponse[]>('/internal/staff/by-oauth', {
    googleOAuthId: `dev::${dto.email}`,
  });
  const staff = staffList.find((s) => s.tenantId === tenantInfo.id && s.isActive);
  let staffActor: { staffId: string; role: 'STAFF' | 'MANAGER' };
  if (staff) {
    staffActor = staff;
  } else {
    const staffByEmail = await backendHttp.get<StaffByEmailResponse>('/internal/staff/by-email', {
      email: dto.email,
      tenantId: tenantInfo.id,
    });
    await backendHttp
      .post<LinkGoogleAccountResponse>(`/internal/staff/${staffByEmail.staffId}/link-google`, {
        tenantId: tenantInfo.id,
        googleOAuthId: `dev::${dto.email}`,
        email: dto.email,
        name: 'Dev User',
      })
      .catch(() => undefined);
    staffActor = staffByEmail;
  }
  return {
    actorId: staffActor.staffId,
    role: staffActor.role,
    accessToken: issueStaffToken(jwtIssuer, staffActor, tenantInfo, 'Dev User'),
  };
}

async function resolveCustomerDevActor(
  backendHttp: BackendHttpService,
  jwtIssuer: JwtIssuerService,
  dto: DevLoginDto,
  tenantInfo: TenantInfoResponse,
): Promise<DevActorResolution> {
  const googleOAuthId = `dev::${dto.email}`;
  if (googleOAuthId.length > 255) {
    // No VO backs this dev-only length check — reuses GenericErrorCode per
    // docs/ENGINEERING_RULES.md § Single source of truth for a validation rule's code.
    throw throwProblemDetail(
      HttpStatus.BAD_REQUEST,
      GenericErrorCode.VALUE_TOO_LONG,
      'Email too long for dev auth',
      'email',
    );
  }
  const customer = await backendHttp.post<FindOrCreateCustomerResponse>('/internal/customers', {
    tenantId: tenantInfo.id,
    email: dto.email,
    name: 'Dev User',
    googleOAuthId,
  });
  return {
    actorId: customer.customerId,
    role: 'CUSTOMER',
    accessToken: issueCustomerToken(jwtIssuer, customer.customerId, tenantInfo, 'Dev User'),
  };
}
