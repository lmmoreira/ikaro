import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpException,
  HttpStatus,
  Post,
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
import { IssueTokenDto, IssueTokenSchema } from './dtos/issue-token.dto';
import { SwitchTenantDto, SwitchTenantSchema } from './dtos/switch-tenant.dto';
import { GoogleAuthGuard } from './guards/google-auth.guard';
import { JwtIssuerService } from './jwt-issuer.service';
import { SelectionTokenService } from './selection-token.service';
import { GoogleProfile } from './strategies/google.strategy';
import {
  ActivateStaffResponse,
  CustomerTenantSummaryResponse,
  FindOrCreateCustomerResponse,
  StaffByEmailResponse,
  StaffInfoResponse,
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
        // First login: invited staff activating their account via invite link
        await this.handleStaffFirstLogin(profile, profile.tenantSlug, res, frontendUrl);
      } else {
        // Regular login: already-activated staff
        await this.handleStaffLogin(profile, res, frontendUrl);
      }
      return;
    }

    if (profile.tenantSlug) {
      await this.handleTenantLogin(profile, profile.tenantSlug, res, frontendUrl);
      return;
    }

    await this.handleMultiTenantLogin(profile, res, frontendUrl);
  }

  @Public()
  @Post('token')
  @UsePipes(new ZodValidationPipe(IssueTokenSchema))
  async issueToken(
    @Body() dto: IssueTokenDto,
  ): Promise<{ accessToken: string; expiresIn: string }> {
    const { googleOAuthId } = this.selectionToken.verifySelectionToken(dto.selectionToken);

    const tenants = await this.backendHttp.get<CustomerTenantSummaryResponse[]>(
      '/internal/customers/tenants',
      { googleOAuthId },
    );
    const match = tenants.find((t) => t.tenantId === dto.tenantId);
    if (!match) {
      throw new ForbiddenException({
        type: 'about:blank',
        title: 'Forbidden',
        status: HttpStatus.FORBIDDEN,
        detail: 'Customer is not registered in this tenant',
      });
    }

    const tenantInfo = await this.backendHttp.get<TenantInfoResponse>(
      `/internal/tenants/${dto.tenantId}`,
    );
    const accessToken = this.jwtIssuer.issueToken({
      sub: match.customerId,
      tenantId: dto.tenantId,
      tenantSlug: tenantInfo.slug,
      role: 'CUSTOMER',
    });

    return { accessToken, expiresIn: this.config.getOrThrow<string>('JWT_EXPIRES_IN') };
  }

  @Post('switch-tenant')
  @Roles('CUSTOMER')
  @UsePipes(new ZodValidationPipe(SwitchTenantSchema))
  async switchTenant(
    @Body() dto: SwitchTenantDto,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<{ accessToken: string; expiresIn: string }> {
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

    return { accessToken, expiresIn: this.config.getOrThrow<string>('JWT_EXPIRES_IN') };
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

    // UC-025 A2: already active → treat as normal login
    if (staffByEmail.isActive) {
      await this.handleStaffLogin(profile, res, frontendUrl);
      return;
    }

    let activated: ActivateStaffResponse;
    try {
      activated = await this.backendHttp.post<ActivateStaffResponse>(
        `/internal/staff/${staffByEmail.staffId}/activate`,
        {
          tenantId: tenantInfo.id,
          googleOAuthId: profile.googleOAuthId,
          email: profile.email,
          name: profile.name,
        },
      );
    } catch (err) {
      if (err instanceof HttpException) {
        if (err.getStatus() === HttpStatus.CONFLICT) {
          // 409 = already active; treat as normal login
          await this.handleStaffLogin(profile, res, frontendUrl);
          return;
        }
        if (err.getStatus() === HttpStatus.UNPROCESSABLE_ENTITY) {
          res.redirect(`${frontendUrl}/auth/error?reason=email-mismatch`);
          return;
        }
      }
      throw err;
    }

    const token = this.jwtIssuer.issueToken({
      sub: activated.staffId,
      tenantId: activated.tenantId,
      tenantSlug: tenantInfo.slug,
      role: activated.role,
    });
    res.cookie('access_token', token, JWT_COOKIE_OPTIONS);
    res.redirect(`${frontendUrl}/dashboard`);
  }

  private async handleStaffLogin(
    profile: GoogleProfile,
    res: Response,
    frontendUrl: string,
  ): Promise<void> {
    const staffInfo = await this.backendHttp
      .get<StaffInfoResponse>('/internal/staff/by-oauth', { googleOAuthId: profile.googleOAuthId })
      .catch((err: unknown) => {
        if (err instanceof HttpException && err.getStatus() === HttpStatus.NOT_FOUND) return null;
        throw err;
      });

    if (!staffInfo) {
      res.redirect(`${frontendUrl}/auth/error?reason=not-a-staff-member`);
      return;
    }

    if (!staffInfo.isActive) {
      res.redirect(`${frontendUrl}/auth/first-login?staffId=${staffInfo.staffId}`);
      return;
    }

    const tenantInfo = await this.backendHttp.get<TenantInfoResponse>(
      `/internal/tenants/${staffInfo.tenantId}`,
    );
    const token = this.jwtIssuer.issueToken({
      sub: staffInfo.staffId,
      tenantId: staffInfo.tenantId,
      tenantSlug: tenantInfo.slug,
      role: staffInfo.role,
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
    res.redirect(`${frontendUrl}/dashboard`);
  }

  private async handleMultiTenantLogin(
    profile: GoogleProfile,
    res: Response,
    frontendUrl: string,
  ): Promise<void> {
    const tenants = await this.backendHttp.get<CustomerTenantSummaryResponse[]>(
      '/internal/customers/tenants',
      { googleOAuthId: profile.googleOAuthId },
    );

    if (tenants.length === 0) {
      res.redirect(`${frontendUrl}/auth/error?reason=no-tenant`);
      return;
    }

    if (tenants.length === 1) {
      const { tenantId, customerId } = tenants[0];
      const tenantInfo = await this.backendHttp.get<TenantInfoResponse>(
        `/internal/tenants/${tenantId}`,
      );
      const token = this.jwtIssuer.issueToken({
        sub: customerId,
        tenantId,
        tenantSlug: tenantInfo.slug,
        role: 'CUSTOMER',
      });
      res.cookie('access_token', token, JWT_COOKIE_OPTIONS);
      res.redirect(`${frontendUrl}/dashboard`);
      return;
    }

    const selectionToken = this.selectionToken.issueSelectionToken(profile.googleOAuthId);
    res.redirect(`${frontendUrl}/select-tenant?token=${selectionToken}`);
  }
}
