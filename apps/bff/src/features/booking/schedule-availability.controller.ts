import { Controller, Get, Headers, Query } from '@nestjs/common';
import { z } from 'zod';
import { Public } from '../../shared/decorators/public.decorator';
import { ZodValidationPipe } from '@ikaro/nestjs-http';
import { BackendHttpService } from '../../shared/http/backend-http.service';
import { withPublicTenant } from '../../shared/http/public-tenant';
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
    return withPublicTenant(this.backendHttp, tenantSlug, (tenantId) =>
      this.backendHttp.getForPublic<AvailabilityResponse>(
        `/schedule/availability?date=${query.date}&serviceIds=${query.serviceIds}`,
        tenantId,
      ),
    );
  }
}
