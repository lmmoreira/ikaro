import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Response } from 'express';
import { ActorRole } from '@ikaro/types';
import { BackendHttpService } from '../../shared/http/backend-http.service';
import { OAUTH_NONCE_COOKIE_NAME } from './cookie-options';
import { StaffTenantOption } from './auth.types';
import { GoogleProfile } from '../../shared/auth/google-profile';
import { JwtIssuerService } from './jwt-issuer.service';
import { CurrentUserPayload } from '../../shared/decorators/current-user.decorator';
import { DevLoginDto } from './dtos/dev-login.dto';
import { SwitchStaffTenantDto } from './dtos/switch-staff-tenant.dto';
import { SwitchTenantDto } from './dtos/switch-tenant.dto';
import { handleStaffLogin } from './auth-staff-login.flow';
import {
  getStaffTenants,
  handleTenantLogin,
  logoutWithTenantSlug,
  switchStaffTenant,
  switchTenant,
} from './auth-tenant-login.flow';
import { devLogin } from './auth-dev-login.flow';

// To keep this file under the file-length cap, the actual Google-callback/dev-login flows live
// in auth-staff-login.flow.ts, auth-tenant-login.flow.ts, and auth-dev-login.flow.ts (plus the
// findTenantBySlug/logger shared by the first two, in auth-login-shared.ts). This class stays a
// thin delegator so auth.controller.ts's DI shape and this file's own spec are unaffected.
@Injectable()
export class AuthControllerFlowService {
  constructor(
    private readonly jwtIssuer: JwtIssuerService,
    private readonly backendHttp: BackendHttpService,
    private readonly config: ConfigService,
  ) {}

  async handleGoogleCallback(profile: GoogleProfile, res: Response): Promise<void> {
    // Single-use hygiene for the CSRF-binding nonce (M17-S32) — already verified by
    // GoogleStrategy.validate() by this point; clear it so it can't be replayed.
    res.clearCookie(OAUTH_NONCE_COOKIE_NAME, { path: '/' });
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
      role: ActorRole;
    };
  }> {
    return devLogin(this.backendHttp, this.jwtIssuer, this.config, dto, res);
  }
}
