import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Response } from 'express';
import { BffErrorCode, GenericErrorCode } from '@ikaro/types';
import { BackendHttpService } from '../../shared/http/backend-http.service';
import { throwProblemDetail } from '../../shared/http/problem-detail';
import { JWT_COOKIE_OPTIONS } from './cookie-options';
import {
  CustomerTenantSummaryResponse,
  FindOrCreateCustomerResponse,
  LinkGoogleAccountResponse,
  StaffByEmailResponse,
  StaffInfoResponse,
  StaffTenantOption,
} from './auth.types';
import { GoogleProfile } from './strategies/google.strategy';
import { JwtIssuerService, JwtRole } from './jwt-issuer.service';
import { isValidSlug } from './oauth-state';
import { TenantInfoResponse } from '../../shared/types/backend-responses';
import { CurrentUserPayload } from '../../shared/decorators/current-user.decorator';
import { DevLoginDto } from './dtos/dev-login.dto';
import { SwitchStaffTenantDto } from './dtos/switch-staff-tenant.dto';
import { SwitchTenantDto } from './dtos/switch-tenant.dto';

type StaffLoginFailureReason = 'email-mismatch' | 'staff-deactivated' | 'account-linked-elsewhere';

@Injectable()
export class AuthControllerFlowService {
  constructor(
    private readonly jwtIssuer: JwtIssuerService,
    private readonly backendHttp: BackendHttpService,
    private readonly config: ConfigService,
  ) {}

  async handleGoogleCallback(profile: GoogleProfile, res: Response): Promise<void> {
    const frontendUrl = this.config.getOrThrow<string>('FRONTEND_URL');

    if (profile.loginType === 'staff') {
      if (profile.tenantSlug) {
        await handleStaffLogin(
          this.backendHttp,
          this.jwtIssuer,
          profile,
          profile.tenantSlug,
          res,
          frontendUrl,
        );
      } else {
        res.redirect(`${frontendUrl}/auth/error?reason=no-tenant`);
      }
      return;
    }

    if (profile.tenantSlug) {
      await handleTenantLogin(
        this.backendHttp,
        this.jwtIssuer,
        profile,
        profile.tenantSlug,
        res,
        frontendUrl,
      );
      return;
    }

    res.redirect(`${frontendUrl}/auth/error?reason=no-tenant`);
  }

  logout(tenantSlug: string | undefined, res: Response): void {
    logoutWithTenantSlug(this.config, tenantSlug, res);
  }

  async getStaffTenants(): Promise<StaffTenantOption[]> {
    return getStaffTenants(this.backendHttp);
  }

  async switchStaffTenant(
    dto: SwitchStaffTenantDto,
    currentUser: CurrentUserPayload,
    res: Response,
  ): Promise<{ tenantSlug: string; expiresIn: string }> {
    return switchStaffTenant(this.backendHttp, this.jwtIssuer, this.config, dto, currentUser, res);
  }

  async switchTenant(
    dto: SwitchTenantDto,
    currentUser: CurrentUserPayload,
    res: Response,
  ): Promise<{ tenantSlug: string; expiresIn: string }> {
    return switchTenant(this.backendHttp, this.jwtIssuer, this.config, dto, currentUser, res);
  }

  async devLogin(
    dto: DevLoginDto,
    res: Response,
  ): Promise<{
    accessToken: string;
    user: {
      sub: string;
      tenantId: string;
      tenantSlug: string;
      role: JwtRole;
    };
  }> {
    return devLogin(this.backendHttp, this.jwtIssuer, this.config, dto, res);
  }
}

function logoutWithTenantSlug(
  config: ConfigService,
  tenantSlug: string | undefined,
  res: Response,
): void {
  res.clearCookie('access_token', JWT_COOKIE_OPTIONS);
  const frontendUrl = config.getOrThrow<string>('FRONTEND_URL');
  const path = tenantSlug && isValidSlug(tenantSlug) ? `/${tenantSlug}` : '';
  res.redirect(`${frontendUrl}${path}`);
}

async function getStaffTenants(backendHttp: BackendHttpService): Promise<StaffTenantOption[]> {
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

async function switchStaffTenant(
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
  const accessToken = jwtIssuer.issueToken({
    sub: match.staffId,
    tenantId: match.tenantId,
    tenantSlug: tenantInfo.slug,
    tenantName: tenantInfo.name,
    userName: currentUser.userName,
    role: match.role,
    locale: tenantInfo.locale,
  });

  res.cookie('access_token', accessToken, JWT_COOKIE_OPTIONS);
  return {
    tenantSlug: tenantInfo.slug,
    expiresIn: config.getOrThrow<string>('JWT_EXPIRES_IN'),
  };
}

async function switchTenant(
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
  const accessToken = jwtIssuer.issueToken({
    sub: match.customerId,
    tenantId: dto.targetTenantId,
    tenantSlug: tenantInfo.slug,
    tenantName: tenantInfo.name,
    userName: currentUser.userName,
    role: 'CUSTOMER',
    locale: tenantInfo.locale,
  });

  res.cookie('access_token', accessToken, JWT_COOKIE_OPTIONS);
  return {
    tenantSlug: tenantInfo.slug,
    expiresIn: config.getOrThrow<string>('JWT_EXPIRES_IN'),
  };
}

async function devLogin(
  backendHttp: BackendHttpService,
  jwtIssuer: JwtIssuerService,
  config: ConfigService,
  dto: DevLoginDto,
  res: Response,
): Promise<{
  accessToken: string;
  user: {
    sub: string;
    tenantId: string;
    tenantSlug: string;
    role: 'CUSTOMER' | 'STAFF' | 'MANAGER';
  };
}> {
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

  const tenantInfo = await backendHttp.get<TenantInfoResponse>(
    `/internal/tenants/by-slug/${encodeURIComponent(dto.tenantSlug)}`,
  );

  let actorId: string;
  let role: JwtRole;

  if (dto.type === 'staff') {
    const staffList = await backendHttp.get<StaffInfoResponse[]>('/internal/staff/by-oauth', {
      googleOAuthId: `dev::${dto.email}`,
    });
    const staff = staffList.find((s) => s.tenantId === tenantInfo.id && s.isActive);
    if (staff) {
      actorId = staff.staffId;
      role = staff.role;
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
      actorId = staffByEmail.staffId;
      role = staffByEmail.role;
    }
  } else {
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
    actorId = customer.customerId;
    role = 'CUSTOMER';
  }

  const accessToken = jwtIssuer.issueToken({
    sub: actorId,
    tenantId: tenantInfo.id,
    tenantSlug: tenantInfo.slug,
    tenantName: tenantInfo.name,
    userName: 'Dev User',
    role,
    locale: tenantInfo.locale,
  });

  res.cookie('access_token', accessToken, JWT_COOKIE_OPTIONS);

  return {
    accessToken,
    user: { sub: actorId, tenantId: tenantInfo.id, tenantSlug: tenantInfo.slug, role },
  };
}

async function handleStaffLogin(
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

  issueStaffToken(jwtIssuer, profile, staffByEmail, tenantInfo, res);
  res.redirect(`${frontendUrl}/dashboard`);
}

async function findTenantBySlug(
  backendHttp: BackendHttpService,
  tenantSlug: string,
): Promise<TenantInfoResponse | null> {
  return backendHttp
    .get<TenantInfoResponse>(`/internal/tenants/by-slug/${tenantSlug}`)
    .catch((err: unknown) => {
      if (err instanceof HttpException && err.getStatus() === HttpStatus.NOT_FOUND) return null;
      throw err;
    });
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

function issueStaffToken(
  jwtIssuer: JwtIssuerService,
  profile: GoogleProfile,
  staffByEmail: StaffByEmailResponse,
  tenantInfo: TenantInfoResponse,
  res: Response,
): void {
  const token = jwtIssuer.issueToken({
    sub: staffByEmail.staffId,
    tenantId: tenantInfo.id,
    tenantSlug: tenantInfo.slug,
    tenantName: tenantInfo.name,
    userName: profile.name,
    role: staffByEmail.role,
    locale: tenantInfo.locale,
  });
  res.cookie('access_token', token, JWT_COOKIE_OPTIONS);
}

async function handleTenantLogin(
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

  const token = jwtIssuer.issueToken({
    sub: customerId,
    tenantId: tenantInfo.id,
    tenantSlug: tenantInfo.slug,
    tenantName: tenantInfo.name,
    userName: profile.name,
    role: 'CUSTOMER',
    locale: tenantInfo.locale,
  });
  res.cookie('access_token', token, JWT_COOKIE_OPTIONS);
  res.redirect(`${frontendUrl}/${tenantInfo.slug}`);
}
