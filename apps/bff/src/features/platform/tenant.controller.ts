import { Body, Controller, HttpCode, HttpStatus, Patch } from '@nestjs/common';
import { z } from 'zod';
import { RenameTenantResponse } from '@ikaro/types';
import { ZodValidationPipe } from '../../shared/http/zod-validation.pipe';
import { Roles } from '../../shared/decorators/roles.decorator';
import { BackendHttpService } from '../../shared/http/backend-http.service';

export const RenameTenantBodySchema = z.object({
  name: z.string().trim().min(1, 'name must not be empty'),
});

type RenameTenantBody = z.infer<typeof RenameTenantBodySchema>;

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
