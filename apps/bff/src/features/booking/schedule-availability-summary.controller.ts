import { Controller, Get, Headers, Query } from '@nestjs/common';
import { Public } from '../../shared/decorators/public.decorator';
import { ZodValidationPipe } from '@ikaro/nestjs-http';
import { BackendHttpService } from '../../shared/http/backend-http.service';
import { AvailabilitySummaryResponse } from './schedule.types';
import { withPublicTenant } from '../../shared/http/public-tenant';
import {
  GetAvailabilitySummaryQuery,
  GetAvailabilitySummaryQuerySchema,
} from './schedule-availability-summary.schemas';

// Request Zod schema moved to schedule-availability-summary.schemas.ts (TD37-S10) —
// re-exported here so existing imports of these symbols from this file keep working unchanged.
export * from './schedule-availability-summary.schemas';

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
        '/schedule/availability/summary',
        tenantId,
        query,
      ),
    );
  }
}
