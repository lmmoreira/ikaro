import { Controller, Get, Headers, HttpException, HttpStatus, Query } from '@nestjs/common';
import { z } from 'zod';
import { Public } from '../../shared/decorators/public.decorator';
import { ZodValidationPipe } from '../../shared/http/zod-validation.pipe';
import { BackendHttpService } from '../../shared/http/backend-http.service';
import { AvailabilityResponse } from './schedule.types';

const GetAvailabilityQuerySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'date must be YYYY-MM-DD'),
  serviceIds: z.string().min(1, 'serviceIds is required'),
});

type GetAvailabilityQuery = z.infer<typeof GetAvailabilityQuerySchema>;

@Controller('schedule/availability')
export class ScheduleAvailabilityController {
  constructor(private readonly backendHttp: BackendHttpService) {}

  @Get()
  @Public()
  async get(
    @Headers('x-tenant-slug') tenantSlug: string | undefined,
    @Query(new ZodValidationPipe(GetAvailabilityQuerySchema)) query: GetAvailabilityQuery,
  ): Promise<AvailabilityResponse> {
    if (!tenantSlug) {
      throw new HttpException(
        {
          type: 'about:blank',
          title: 'Bad Request',
          status: 400,
          detail: 'X-Tenant-Slug header is required',
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    const tenant = await this.backendHttp.get<{ id: string }>(
      `/internal/tenants/by-slug/${tenantSlug}`,
    );

    return this.backendHttp.getForPublic<AvailabilityResponse>(
      `/schedule/availability?date=${query.date}&serviceIds=${query.serviceIds}`,
      tenant.id,
    );
  }
}
