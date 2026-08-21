import { Body, Controller, HttpCode, HttpStatus, Patch } from '@nestjs/common';
import { RenameTenantResponse } from '@ikaro/types';
import { ZodValidationPipe } from '@ikaro/nestjs-http';
import { Roles } from '../../shared/decorators/roles.decorator';
import { BackendHttpService } from '../../shared/http/backend-http.service';
import { RenameTenantBody, RenameTenantBodySchema } from './tenant.schemas';

// Request Zod schema moved to tenant.schemas.ts (TD37-S10) — re-exported here so existing
// imports of these symbols from this file keep working unchanged.
export * from './tenant.schemas';

@Controller('tenants')
@Roles('MANAGER')
export class TenantController {
  constructor(private readonly backendHttp: BackendHttpService) {}

  @Patch()
  @HttpCode(HttpStatus.OK)
  rename(
    @Body(new ZodValidationPipe(RenameTenantBodySchema)) body: RenameTenantBody,
  ): Promise<RenameTenantResponse> {
    return this.backendHttp.patch<RenameTenantResponse>('/tenants', body);
  }
}
