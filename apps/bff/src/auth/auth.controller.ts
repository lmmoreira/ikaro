import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  HttpException,
  HttpStatus,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
  UsePipes,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthGuard } from '@nestjs/passport';
import { Request, Response } from 'express';
import { CurrentUser, CurrentUserPayload } from '../shared/decorators/current-user.decorator';
import { Public } from '../shared/decorators/public.decorator';
import { Roles } from '../shared/decorators/roles.decorator';
import { BackendHttpService } from '../shared/http/backend-http.service';
import { ZodValidationPipe } from '../shared/http/zod-validation.pipe';
import { JWT_COOKIE_OPTIONS } from './cookie-options';
import { DevLoginDto, DevLoginResponse, DevLoginSchema } from './dtos/dev-login.dto';
import { IssueStaffTokenDto, IssueStaffTokenSchema } from './dtos/issue-staff-token.dto';
import { SwitchTenantDto, SwitchTenantSchema } from './dtos/switch-tenant.dto';
import { GoogleAuthGuard } from './guards/google-auth.guard';
import { JwtIssuerService } from './jwt-issuer.service';
import { isValidSlug } from './oauth-state';
import { SelectionTokenService } from './selection-token.service';
import { GoogleProfile } from './strategies/google.strategy';
import {
  CustomerTenantSummaryResponse,
  FindOrCreateCustomerResponse,
  LinkGoogleAccountResponse,
  StaffByEmailAcrossTenantsResponse,
  StaffByEmailResponse,
  StaffInfoResponse,
  StaffTenantOption,
} from './auth.types';
import { TenantInfoResponse } from '../shared/types/backend-responses';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly jwtIssuer: JwtIssuerService,
    private readonly selectionToken: SelectionTokenService,
    private readonly backendHttp: BackendHttpService,
    private readonly config: ConfigService,
  ) {}

  @Public()
  @UseGuards(GoogleAuthGuard)
  @Get('google')
  login(): void {
    // GoogleAuthGuard passes tenantSlug or '__staff__' as OAuth state → Google redirects
  }

  @Public()
  @UseGuards(AuthGuard('google'))
  @Get('google/callback')
  async handleGoogleCallback(@Req() req: Request, @Res() res: Response): Promise<void> {
    const profile = req.user as GoogleProfile;
    const frontendUrl = this.config.getOrThrow<string>('FRONTEND_URL');

    if (profile.loginType === 'staff') {
      if (profile.tenantSlug) {
        await this.handleStaffFirstLogin(profile, profile.tenantSlug, res, frontendUrl);
      } else {
        await this.handleStaffLogin(profile, res, frontendUrl);
      }
      return;
    }

    if (profile.tenantSlug) {
      await this.handleTenantLogin(profile, profile.tenantSlug, res, frontendUrl);
      return;
    }

    // No shipped UI initiates a customer OAuth flow without a tenantSlug — every "Entrar"
    // link supplies one. Defensive fallback only; see docs/04-USE_CASES.md UC-021.
    res.redirect(`${frontendUrl}/auth/error?reason=no-tenant`);
  }

  @Public()
  @Get('logout')
  logout(@Query('tenantSlug') tenantSlug: string | undefined, @Res() res: Response): void {
    res.clearCookie('access_token', JWT_COOKIE_OPTIONS);
    const frontendUrl = this.config.getOrThrow<string>('FRONTEND_URL');
    const path = tenantSlug && isValidSlug(tenantSlug) ? `/${tenantSlug}` : '';
    res.redirect(`${frontendUrl}${path}`);
  }

  @Public()
  @Get('staff-tenants')
  async getStaffTenants(@Query('token') token: string): Promise<StaffTenantOption[]> {
    const { googleOAuthId } = this.selectionToken.verifySelectionToken(token);
    const staffList = await this.backendHttp.get<StaffInfoResponse[]>('/internal/staff/by-oauth', {
      googleOAuthId,
    });
    const activeStaff = staffList.filter((s) => s.isActive);
    return Promise.all(
      activeStaff.map(async (s) => {
        const tenantInfo = await this.backendHttp.get<TenantInfoResponse>(
          `/internal/tenants/${s.tenantId}`,
        );
        return {
          staffId: s.staffId,
          tenantId: s.tenantId,
          tenantSlug: tenantInfo.slug,
          tenantName: tenantInfo.name,
          role: s.role,
        };
      }),
    );
  }

  @Public()
  @Post('staff-token')
  @HttpCode(HttpStatus.OK)
  @UsePipes(new ZodValidationPipe(IssueStaffTokenSchema))
  async issueStaffToken(
    @Body() dto: IssueStaffTokenDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ tenantSlug: string; expiresIn: string }> {
    const { googleOAuthId } = this.selectionToken.verifySelectionToken(dto.selectionToken);
    const staffList = await this.backendHttp.get<StaffInfoResponse[]>('/internal/staff/by-oauth', {
      googleOAuthId,
    });
    const match = staffList.find((s) => s.staffId === dto.staffId && s.isActive);
    if (!match) {
      throw new ForbiddenException({
        type: 'about:blank',
        title: 'Forbidden',
        status: HttpStatus.FORBIDDEN,
        detail: 'Staff record not found or not active',
      });
    }

    const tenantInfo = await this.backendHttp.get<TenantInfoResponse>(
      `/internal/tenants/${match.tenantId}`,
    );
    const accessToken = this.jwtIssuer.issueToken({
      sub: match.staffId,
      tenantId: match.tenantId,
      tenantSlug: tenantInfo.slug,
      role: match.role,
    });

    res.cookie('access_token', accessToken, JWT_COOKIE_OPTIONS);
    return {
      tenantSlug: tenantInfo.slug,
      expiresIn: this.config.getOrThrow<string>('JWT_EXPIRES_IN'),
    };
  }

  @Post('switch-tenant')
  @Roles('CUSTOMER')
  async switchTenant(
    @Body(new ZodValidationPipe(SwitchTenantSchema)) dto: SwitchTenantDto,
    @CurrentUser() user: CurrentUserPayload,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ tenantSlug: string; expiresIn: string }> {
    const tenants = await this.backendHttp.get<CustomerTenantSummaryResponse[]>(
      `/internal/customers/${user.sub}/tenants`,
      { tenantId: user.tenantId },
    );
    const match = tenants.find((t) => t.tenantId === dto.targetTenantId);
    if (!match) {
      throw new ForbiddenException({
        type: 'about:blank',
        title: 'Forbidden',
        status: HttpStatus.FORBIDDEN,
        detail: 'Customer is not registered in the target tenant',
      });
    }

    const tenantInfo = await this.backendHttp.get<TenantInfoResponse>(
      `/internal/tenants/${dto.targetTenantId}`,
    );
    const accessToken = this.jwtIssuer.issueToken({
      sub: match.customerId,
      tenantId: dto.targetTenantId,
      tenantSlug: tenantInfo.slug,
      role: 'CUSTOMER',
    });

    res.cookie('access_token', accessToken, JWT_COOKIE_OPTIONS);
    return {
      tenantSlug: tenantInfo.slug,
      expiresIn: this.config.getOrThrow<string>('JWT_EXPIRES_IN'),
    };
  }

  @Public()
  @Post('dev-login')
  @HttpCode(HttpStatus.OK)
  async devLogin(
    @Body(new ZodValidationPipe(DevLoginSchema)) dto: DevLoginDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<DevLoginResponse> {
    if (this.config.get<string>('ENABLE_DEV_AUTH') !== 'true') {
      throw new ForbiddenException({
        type: 'about:blank',
        title: 'Forbidden',
        status: HttpStatus.FORBIDDEN,
        detail: 'Dev auth is not enabled',
      });
    }
    if (this.config.get<string>('NODE_ENV') === 'production') {
      throw new ForbiddenException({
        type: 'about:blank',
        title: 'Forbidden',
        status: HttpStatus.FORBIDDEN,
        detail: 'Dev auth is not available in production',
      });
    }

    const tenantInfo = await this.backendHttp.get<TenantInfoResponse>(
      `/internal/tenants/by-slug/${encodeURIComponent(dto.tenantSlug)}`,
    );

    let actorId: string;
    let role: 'CUSTOMER' | 'STAFF' | 'MANAGER';

    if (dto.type === 'staff') {
      const staffList = await this.backendHttp.get<StaffInfoResponse[]>(
        '/internal/staff/by-oauth',
        { googleOAuthId: `dev::${dto.email}` },
      );
      const staff = staffList.find((s) => s.tenantId === tenantInfo.id && s.isActive);
      if (staff) {
        actorId = staff.staffId;
        role = staff.role;
      } else {
        const staffByEmail = await this.backendHttp.get<StaffByEmailResponse>(
          '/internal/staff/by-email',
          { email: dto.email, tenantId: tenantInfo.id },
        );
        // Ignore 409 conflicts: seed staff have a real google_oauth_id pre-set; linking
        // dev::email would conflict. Finding the staff by email is sufficient trust here.
        await this.backendHttp
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
        throw new HttpException(
          {
            title: 'Bad Request',
            status: HttpStatus.BAD_REQUEST,
            detail: 'Email too long for dev auth',
          },
          HttpStatus.BAD_REQUEST,
        );
      }
      const customer = await this.backendHttp.post<FindOrCreateCustomerResponse>(
        '/internal/customers',
        {
          tenantId: tenantInfo.id,
          email: dto.email,
          name: 'Dev User',
          googleOAuthId,
        },
      );
      actorId = customer.customerId;
      role = 'CUSTOMER';
    }

    const accessToken = this.jwtIssuer.issueToken({
      sub: actorId,
      tenantId: tenantInfo.id,
      tenantSlug: tenantInfo.slug,
      role,
    });

    res.cookie('access_token', accessToken, JWT_COOKIE_OPTIONS);

    return {
      accessToken,
      user: { sub: actorId, tenantId: tenantInfo.id, tenantSlug: tenantInfo.slug, role },
    };
  }

  private async handleStaffLogin(
    profile: GoogleProfile,
    res: Response,
    frontendUrl: string,
  ): Promise<void> {
    let staffList = await this.backendHttp.get<StaffInfoResponse[]>('/internal/staff/by-oauth', {
      googleOAuthId: profile.googleOAuthId,
    });

    // This Google account has never been linked to any staff record. Rather than failing
    // outright, try matching by Google's own verified email — covers first login for an
    // invited-but-not-yet-linked staff member who used the generic "Entrar com Google" button
    // instead of a tenant-scoped invite link (the invite email's link is currently broken, see
    // td/TD13-STAFF-INVITE-EMAIL-LINK.md). Trusts the same Google-verified email the tenant-scoped
    // first-login flow (handleStaffFirstLogin) already trusts — this isn't a new trust boundary.
    if (staffList.length === 0) {
      await this.linkStaffByVerifiedEmail(profile);
      staffList = await this.backendHttp.get<StaffInfoResponse[]>('/internal/staff/by-oauth', {
        googleOAuthId: profile.googleOAuthId,
      });
    }

    const activeStaff = staffList.filter((s) => s.isActive);

    if (activeStaff.length === 0) {
      const reason = staffList.some((s) => !s.isActive)
        ? 'staff-deactivated'
        : 'not-a-staff-member';
      res.redirect(`${frontendUrl}/auth/error?reason=${reason}`);
      return;
    }

    if (activeStaff.length === 1) {
      const staff = activeStaff[0];
      const tenantInfo = await this.backendHttp.get<TenantInfoResponse>(
        `/internal/tenants/${staff.tenantId}`,
      );
      const token = this.jwtIssuer.issueToken({
        sub: staff.staffId,
        tenantId: staff.tenantId,
        tenantSlug: tenantInfo.slug,
        role: staff.role,
      });
      res.cookie('access_token', token, JWT_COOKIE_OPTIONS);
      res.redirect(`${frontendUrl}/dashboard`);
      return;
    }

    const selectionToken = this.selectionToken.issueSelectionToken(profile.googleOAuthId);
    res.redirect(`${frontendUrl}/select-staff-tenant?token=${selectionToken}`);
  }

  // Links this Google account to every active, not-yet-linked staff record found for its
  // verified email — across however many tenants. Safe because each record already exists with
  // is_active=true, granted independently by that tenant's own manager at invite time; this only
  // completes an activation already authorized, it doesn't grant new access. Best-effort: an
  // individual link call failing (e.g. a concurrent request racing to link the same record) is
  // swallowed here — the re-fetch by googleOAuthId immediately after this call reflects whatever
  // actually got linked, and the caller's normal active.length branching takes it from there.
  private async linkStaffByVerifiedEmail(profile: GoogleProfile): Promise<void> {
    const matches = await this.backendHttp.get<StaffByEmailAcrossTenantsResponse[]>(
      '/internal/staff/by-email-all',
      { email: profile.email },
    );
    const activeMatches = matches.filter((m) => m.isActive);

    await Promise.all(
      activeMatches.map((match) =>
        this.backendHttp
          .post(`/internal/staff/${match.staffId}/link-google`, {
            tenantId: match.tenantId,
            googleOAuthId: profile.googleOAuthId,
            email: profile.email,
            name: profile.name,
          })
          .catch(() => undefined),
      ),
    );
  }

  private async handleStaffFirstLogin(
    profile: GoogleProfile,
    tenantSlug: string,
    res: Response,
    frontendUrl: string,
  ): Promise<void> {
    const tenantInfo = await this.backendHttp
      .get<TenantInfoResponse>(`/internal/tenants/by-slug/${tenantSlug}`)
      .catch((err: unknown) => {
        if (err instanceof HttpException && err.getStatus() === HttpStatus.NOT_FOUND) return null;
        throw err;
      });
    if (!tenantInfo) {
      res.redirect(`${frontendUrl}/auth/error?reason=tenant-not-found`);
      return;
    }

    const staffByEmail = await this.backendHttp
      .get<StaffByEmailResponse>('/internal/staff/by-email', {
        email: profile.email,
        tenantId: tenantInfo.id,
      })
      .catch((err: unknown) => {
        if (err instanceof HttpException && err.getStatus() === HttpStatus.NOT_FOUND) return null;
        throw err;
      });

    if (!staffByEmail) {
      res.redirect(`${frontendUrl}/auth/error?reason=invite-not-found`);
      return;
    }

    if (!staffByEmail.isActive) {
      res.redirect(`${frontendUrl}/auth/error?reason=staff-deactivated`);
      return;
    }

    try {
      await this.backendHttp.post<LinkGoogleAccountResponse>(
        `/internal/staff/${staffByEmail.staffId}/link-google`,
        {
          tenantId: tenantInfo.id,
          googleOAuthId: profile.googleOAuthId,
          email: profile.email,
          name: profile.name,
        },
      );
    } catch (err) {
      if (err instanceof HttpException) {
        if (err.getStatus() === HttpStatus.UNPROCESSABLE_ENTITY) {
          res.redirect(`${frontendUrl}/auth/error?reason=email-mismatch`);
          return;
        }
        if (err.getStatus() === HttpStatus.FORBIDDEN) {
          res.redirect(`${frontendUrl}/auth/error?reason=staff-deactivated`);
          return;
        }
        if (err.getStatus() === HttpStatus.CONFLICT) {
          res.redirect(`${frontendUrl}/auth/error?reason=account-linked-elsewhere`);
          return;
        }
      }
      throw err;
    }

    const token = this.jwtIssuer.issueToken({
      sub: staffByEmail.staffId,
      tenantId: tenantInfo.id,
      tenantSlug: tenantInfo.slug,
      role: staffByEmail.role,
    });
    res.cookie('access_token', token, JWT_COOKIE_OPTIONS);
    res.redirect(`${frontendUrl}/dashboard`);
  }

  private async handleTenantLogin(
    profile: GoogleProfile,
    tenantSlug: string,
    res: Response,
    frontendUrl: string,
  ): Promise<void> {
    const tenantInfo = await this.backendHttp
      .get<TenantInfoResponse>(`/internal/tenants/by-slug/${tenantSlug}`)
      .catch((err: unknown) => {
        if (err instanceof HttpException && err.getStatus() === HttpStatus.NOT_FOUND) return null;
        throw err;
      });

    if (!tenantInfo) {
      res.redirect(`${frontendUrl}/auth/error?reason=tenant-not-found`);
      return;
    }

    const { customerId } = await this.backendHttp.post<FindOrCreateCustomerResponse>(
      '/internal/customers',
      {
        tenantId: tenantInfo.id,
        googleOAuthId: profile.googleOAuthId,
        email: profile.email,
        name: profile.name,
      },
    );

    const token = this.jwtIssuer.issueToken({
      sub: customerId,
      tenantId: tenantInfo.id,
      tenantSlug: tenantInfo.slug,
      role: 'CUSTOMER',
    });
    res.cookie('access_token', token, JWT_COOKIE_OPTIONS);
    res.redirect(`${frontendUrl}/${tenantInfo.slug}`);
  }
}
