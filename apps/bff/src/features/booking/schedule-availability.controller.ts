import { Controller, Get, Headers, Query } from '@nestjs/common';
import { Public } from '../../shared/decorators/public.decorator';
import { ZodValidationPipe } from '@ikaro/nestjs-http';
import { BackendHttpService } from '../../shared/http/backend-http.service';
import { withPublicTenant } from '../../shared/http/public-tenant';
import { AvailabilityResponse } from './schedule.types';
import { GetAvailabilityQuery, GetAvailabilityQuerySchema } from './schedule-availability.schemas';

// Request Zod schema moved to schedule-availability.schemas.ts (TD37-S10) — re-exported here so
// existing imports of these symbols from this file keep working unchanged.
export * from './schedule-availability.schemas';

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
        '/schedule/availability',
        tenantId,
        query,
      ),
    );
  }
}
