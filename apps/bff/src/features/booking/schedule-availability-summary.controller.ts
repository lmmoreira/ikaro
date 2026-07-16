import { Controller, Get, Headers, Query } from '@nestjs/common';
import { z } from 'zod';
import { Public } from '../../shared/decorators/public.decorator';
import { ZodValidationPipe } from '@ikaro/nestjs-http';
import { BackendHttpService } from '../../shared/http/backend-http.service';
import { AvailabilitySummaryResponse } from './schedule.types';
import { withPublicTenant } from '../../shared/http/public-tenant';

const GetAvailabilitySummaryQuerySchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'from must be YYYY-MM-DD'),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'to must be YYYY-MM-DD'),
  serviceIds: z.string().min(1, 'serviceIds is required'),
});

type GetAvailabilitySummaryQuery = z.infer<typeof GetAvailabilitySummaryQuerySchema>;

@Controller('schedule/availability/summary')
export class ScheduleAvailabilitySummaryController {
  constructor(private readonly backendHttp: BackendHttpService) {}

  @Get()
  @Public()
  async get(
    @Headers('x-tenant-slug') tenantSlug: string | undefined,
    @Query(new ZodValidationPipe(GetAvailabilitySummaryQuerySchema))
    query: GetAvailabilitySummaryQuery,
  ): Promise<AvailabilitySummaryResponse> {
    return withPublicTenant(this.backendHttp, tenantSlug, (tenantId) =>
      this.backendHttp.getForPublic<AvailabilitySummaryResponse>(
        `/schedule/availability/summary?from=${query.from}&to=${query.to}&serviceIds=${query.serviceIds}`,
        tenantId,
      ),
    );
  }
}
