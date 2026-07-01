import { Body, Controller, Get, HttpCode, Post, Query, Req, Res, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Request, Response } from 'express';
import { CurrentUser, CurrentUserPayload } from '../shared/decorators/current-user.decorator';
import { Public } from '../shared/decorators/public.decorator';
import { Roles } from '../shared/decorators/roles.decorator';
import { ZodValidationPipe } from '../shared/http/zod-validation.pipe';
import { DevLoginDto, DevLoginResponse, DevLoginSchema } from './dtos/dev-login.dto';
import { SwitchStaffTenantDto, SwitchStaffTenantSchema } from './dtos/switch-staff-tenant.dto';
import { SwitchTenantDto, SwitchTenantSchema } from './dtos/switch-tenant.dto';
import { GoogleAuthGuard } from './guards/google-auth.guard';
import { AuthControllerFlowService } from './auth-controller-flow.service';
import { GoogleProfile } from './strategies/google.strategy';
import { StaffTenantOption } from './auth.types';

@Controller('auth')
export class AuthController {
  constructor(private readonly authFlow: AuthControllerFlowService) {}

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
    await this.authFlow.handleGoogleCallback(req.user as GoogleProfile, res);
  }

  @Public()
  @Get('logout')
  logout(@Query('tenantSlug') tenantSlug: string | undefined, @Res() res: Response): void {
    this.authFlow.logout(tenantSlug, res);
  }

  @Get('staff-tenants')
  @Roles('STAFF', 'MANAGER')
  getStaffTenants(): Promise<StaffTenantOption[]> {
    return this.authFlow.getStaffTenants();
  }

  @Post('switch-staff-tenant')
  @HttpCode(200)
  @Roles('STAFF', 'MANAGER')
  switchStaffTenant(
    @Body(new ZodValidationPipe(SwitchStaffTenantSchema)) dto: SwitchStaffTenantDto,
    @CurrentUser() currentUser: CurrentUserPayload,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ tenantSlug: string; expiresIn: string }> {
    return this.authFlow.switchStaffTenant(dto, currentUser, res);
  }

  @Post('switch-tenant')
  @Roles('CUSTOMER')
  @HttpCode(200)
  switchTenant(
    @Body(new ZodValidationPipe(SwitchTenantSchema)) dto: SwitchTenantDto,
    @CurrentUser() currentUser: CurrentUserPayload,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ tenantSlug: string; expiresIn: string }> {
    return this.authFlow.switchTenant(dto, currentUser, res);
  }

  @Public()
  @Post('dev-login')
  @HttpCode(200)
  devLogin(
    @Body(new ZodValidationPipe(DevLoginSchema)) dto: DevLoginDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<DevLoginResponse> {
    return this.authFlow.devLogin(dto, res);
  }
}
