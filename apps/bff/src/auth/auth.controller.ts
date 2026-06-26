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
import { SwitchStaffTenantDto, SwitchStaffTenantSchema } from './dtos/switch-staff-tenant.dto';
import { SwitchTenantDto, SwitchTenantSchema } from './dtos/switch-tenant.dto';
import { GoogleAuthGuard } from './guards/google-auth.guard';
import { JwtIssuerService } from './jwt-issuer.service';
import { isValidSlug } from './oauth-state';
import { GoogleProfile } from './strategies/google.strategy';
import {
  CustomerTenantSummaryResponse,
  FindOrCreateCustomerResponse,
  LinkGoogleAccountResponse,
  StaffByEmailResponse,
  StaffInfoResponse,
  StaffTenantOption,
} from './auth.types';
import { TenantInfoResponse } from '../shared/types/backend-responses';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly jwtIssuer: JwtIssuerService,
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
        // All staff entry points carry ?tenantSlug= (hotsite link, invite email).
        // A slug-less OAuth callback means someone reached /dashboard/login directly —
        // there is no valid tenant context to log into.
        res.redirect(`${frontendUrl}/auth/error?reason=no-tenant`);
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

  @Get('staff-tenants')
  @Roles('STAFF', 'MANAGER')
  async getStaffTenants(): Promise<StaffTenantOption[]> {
    const staffList = await this.backendHttp.get<StaffInfoResponse[]>('/staff/me/tenants');
    const activeStaff = staffList.filter((s) => s.isActive);
    if (activeStaff.length === 0) return [];

    const tenantIds = [...new Set(activeStaff.map((s) => s.tenantId))];
    const tenants = await this.backendHttp.get<TenantInfoResponse[]>(
      `/internal/tenants?ids=${tenantIds.join(',')}`,
    );
    const tenantMap = new Map(tenants.map((t) => [t.id, t]));

    return activeStaff.map((s) => {
      const tenantInfo = tenantMap.get(s.tenantId);
      if (!tenantInfo) throw new Error(`Tenant ${s.tenantId} missing from batch response`);
      return {
        staffId: s.staffId,
        tenantId: s.tenantId,
        tenantSlug: tenantInfo.slug,
        tenantName: tenantInfo.name,
        role: s.role,
      };
    });
  }

  @Post('switch-staff-tenant')
  @HttpCode(HttpStatus.OK)
  @Roles('STAFF', 'MANAGER')
  async switchStaffTenant(
    @Body(new ZodValidationPipe(SwitchStaffTenantSchema)) dto: SwitchStaffTenantDto,
    @CurrentUser() currentUser: CurrentUserPayload,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ tenantSlug: string; expiresIn: string }> {
    const staffList = await this.backendHttp.get<StaffInfoResponse[]>('/staff/me/tenants');
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
      tenantName: tenantInfo.name,
      userName: currentUser.userName,
      role: match.role,
      locale: tenantInfo.locale,
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
    @CurrentUser() currentUser: CurrentUserPayload,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ tenantSlug: string; expiresIn: string }> {
    const tenants =
      await this.backendHttp.get<CustomerTenantSummaryResponse[]>('/customers/me/tenants');
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
      tenantName: tenantInfo.name,
      userName: currentUser.userName,
      role: 'CUSTOMER',
      locale: tenantInfo.locale,
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

    const slugParam = `&tenantSlug=${encodeURIComponent(tenantSlug)}`;

    if (!staffByEmail) {
      res.redirect(`${frontendUrl}/auth/error?reason=invite-not-found${slugParam}`);
      return;
    }

    if (!staffByEmail.isActive) {
      res.redirect(`${frontendUrl}/auth/error?reason=staff-deactivated${slugParam}`);
      return;
    }

    const alreadyLinked = staffByEmail.googleOAuthId === profile.googleOAuthId;

    if (!alreadyLinked) {
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
            res.redirect(`${frontendUrl}/auth/error?reason=email-mismatch${slugParam}`);
            return;
          }
          if (err.getStatus() === HttpStatus.FORBIDDEN) {
            res.redirect(`${frontendUrl}/auth/error?reason=staff-deactivated${slugParam}`);
            return;
          }
          if (err.getStatus() === HttpStatus.CONFLICT) {
            res.redirect(`${frontendUrl}/auth/error?reason=account-linked-elsewhere${slugParam}`);
            return;
          }
        }
        throw err;
      }
    }

    const token = this.jwtIssuer.issueToken({
      sub: staffByEmail.staffId,
      tenantId: tenantInfo.id,
      tenantSlug: tenantInfo.slug,
      tenantName: tenantInfo.name,
      userName: profile.name,
      role: staffByEmail.role,
      locale: tenantInfo.locale,
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
      tenantName: tenantInfo.name,
      userName: profile.name,
      role: 'CUSTOMER',
      locale: tenantInfo.locale,
    });
    res.cookie('access_token', token, JWT_COOKIE_OPTIONS);
    res.redirect(`${frontendUrl}/${tenantInfo.slug}`);
  }
}
