import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  HttpException,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { z } from 'zod';
import { Public } from '../shared/decorators/public.decorator';
import { Roles } from '../shared/decorators/roles.decorator';
import { ZodValidationPipe } from '../shared/http/zod-validation.pipe';
import { BackendHttpService } from '../shared/http/backend-http.service';
import { TenantInfoResponse } from '../shared/types/backend-responses';
import { ServiceResponse, ServiceListResponse } from './services.types';

const CreateServiceBodySchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  priceAmount: z.number().positive(),
  durationMinutes: z.number().int().positive(),
  loyaltyPointsValue: z.number().int().min(0),
  requiresPickupAddress: z.boolean().optional(),
});

const UpdateServiceBodySchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  priceAmount: z.number().positive().optional(),
  durationMinutes: z.number().int().positive().optional(),
  loyaltyPointsValue: z.number().int().min(0).optional(),
  requiresPickupAddress: z.boolean().optional(),
});

type CreateServiceBody = z.infer<typeof CreateServiceBodySchema>;
type UpdateServiceBody = z.infer<typeof UpdateServiceBodySchema>;

@Controller('services')
export class ServicesController {
  constructor(private readonly backendHttp: BackendHttpService) {}

  @Get()
  @Public()
  async list(
    @Headers('x-tenant-slug') tenantSlug: string | undefined,
  ): Promise<ServiceListResponse> {
    if (!tenantSlug) {
      throw new HttpException(
        {
          type: 'about:blank',
          title: 'Bad Request',
          status: HttpStatus.BAD_REQUEST,
          detail: 'X-Tenant-Slug header is required',
        },
        HttpStatus.BAD_REQUEST,
      );
    }
    const tenant = await this.backendHttp.get<TenantInfoResponse>(
      `/internal/tenants/by-slug/${tenantSlug}`,
    );
    return this.backendHttp.getForPublic<ServiceListResponse>('/services', tenant.id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Roles('MANAGER', 'STAFF')
  create(
    @Body(new ZodValidationPipe(CreateServiceBodySchema)) body: CreateServiceBody,
  ): Promise<ServiceResponse> {
    return this.backendHttp.post<ServiceResponse>('/services', body);
  }

  @Patch(':id')
  @HttpCode(HttpStatus.OK)
  @Roles('MANAGER', 'STAFF')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(UpdateServiceBodySchema)) body: UpdateServiceBody,
  ): Promise<ServiceResponse> {
    return this.backendHttp.patch<ServiceResponse>(`/services/${id}`, body);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @Roles('MANAGER', 'STAFF')
  deactivate(@Param('id', ParseUUIDPipe) id: string): Promise<{ id: string; isActive: false }> {
    return this.backendHttp.delete<{ id: string; isActive: false }>(`/services/${id}`);
  }
}
