import { Controller, Get, Query } from '@nestjs/common';
import { ZodValidationPipe } from '@ikaro/nestjs-http';
import { Roles } from '../../shared/decorators/roles.decorator';
import { BackendHttpService } from '../../shared/http/backend-http.service';
import { DayGridResponse } from './schedule.types';
import { GetDayGridQuery, GetDayGridQuerySchema } from './schedule-day-grid.schemas';

// Request Zod schema moved to schedule-day-grid.schemas.ts — re-exported here so existing imports
// of these symbols from this file keep working unchanged (mirrors schedule-opening.controller.ts).
export * from './schedule-day-grid.schemas';

@Controller('schedule/day-grid')
@Roles('MANAGER')
export class ScheduleDayGridController {
  constructor(private readonly backendHttp: BackendHttpService) {}

  @Get()
  get(
    @Query(new ZodValidationPipe(GetDayGridQuerySchema)) query: GetDayGridQuery,
  ): Promise<DayGridResponse> {
    return this.backendHttp.get<DayGridResponse>('/schedule/day-grid', query);
  }
}
