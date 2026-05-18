import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpStatus,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Request, Response } from 'express';
import { z } from 'zod';
import { Public } from '../shared/decorators/public.decorator';
import { BackendHttpService } from '../shared/http/backend-http.service';
import { JWT_COOKIE_OPTIONS } from './cookie-options';
import { GoogleAuthGuard } from './guards/google-auth.guard';
import { JwtIssuerService } from './jwt-issuer.service';
import { SelectionTokenService } from './selection-token.service';
import { GoogleProfile } from './strategies/google.strategy';

interface CustomerTenantSummary {
  tenantId: string;
  customerId: string;
}

interface TenantInfoResponse {
  id: string;
  slug: string;
  name: string;
}

interface FindOrCreateCustomerResult {
  customerId: string;
  created: boolean;
}

const IssueTokenSchema = z.object({
  selectionToken: z.string().min(1),
  tenantId: z.uuid(),
});

@Controller('auth')
export class AuthController {
  constructor(
    private readonly jwtIssuer: JwtIssuerService,
    private readonly selectionToken: SelectionTokenService,
    private readonly backendHttp: BackendHttpService,
  ) {}

  @Public()
  @UseGuards(GoogleAuthGuard)
  @Get('google')
  login(): void {
    // GoogleAuthGuard passes tenantSlug as OAuth state → Google redirects
  }

  @Public()
  @UseGuards(AuthGuard('google'))
  @Get('google/callback')
  async handleGoogleCallback(@Req() req: Request, @Res() res: Response): Promise<void> {
    const profile = req.user as GoogleProfile;
    const frontendUrl = process.env['FRONTEND_URL'] ?? 'http://localhost:3000';

    if (profile.tenantSlug) {
      await this.handleTenantLogin(profile, profile.tenantSlug, res, frontendUrl);
      return;
    }

    await this.handleMultiTenantLogin(profile, res, frontendUrl);
  }

  @Public()
  @Post('token')
  async issueToken(
    @Body() body: unknown,
    @Req() _req: Request,
  ): Promise<{ accessToken: string; expiresIn: string }> {
    const parsed = IssueTokenSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({
        type: 'about:blank',
        title: 'Bad Request',
        status: HttpStatus.BAD_REQUEST,
        detail: 'selectionToken (string) and tenantId (UUID) are required',
      });
    }

    const { selectionToken, tenantId } = parsed.data;
    const { googleOAuthId } = this.selectionToken.verifySelectionToken(selectionToken);

    const tenants = await this.backendHttp.get<CustomerTenantSummary[]>(
      '/internal/customers/tenants',
      { googleOAuthId },
    );
    const match = tenants.find((t) => t.tenantId === tenantId);
    if (!match) {
      throw new ForbiddenException({
        type: 'about:blank',
        title: 'Forbidden',
        status: HttpStatus.FORBIDDEN,
        detail: 'Customer is not registered in this tenant',
      });
    }

    const tenantInfo = await this.backendHttp.get<TenantInfoResponse>(
      `/internal/tenants/${tenantId}`,
    );
    const accessToken = this.jwtIssuer.issueToken({
      sub: match.customerId,
      tenantId,
      tenantSlug: tenantInfo.slug,
      role: 'CUSTOMER',
    });

    return { accessToken, expiresIn: process.env['JWT_EXPIRES_IN'] ?? '7d' };
  }

  private async handleTenantLogin(
    profile: GoogleProfile,
    tenantSlug: string,
    res: Response,
    frontendUrl: string,
  ): Promise<void> {
    const tenantInfo = await this.backendHttp
      .get<TenantInfoResponse>(`/internal/tenants/by-slug/${tenantSlug}`)
      .catch(() => null);

    if (!tenantInfo) {
      res.redirect(`${frontendUrl}/auth/error?reason=tenant-not-found`);
      return;
    }

    const { customerId } = await this.backendHttp.post<FindOrCreateCustomerResult>(
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
    const tenants = await this.backendHttp.get<CustomerTenantSummary[]>(
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
