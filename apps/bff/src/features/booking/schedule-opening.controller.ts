import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { Roles } from '../../shared/decorators/roles.decorator';
import { CanonicalParseUUIDPipe, ZodValidationPipe } from '@ikaro/nestjs-http';
import { BackendHttpService } from '../../shared/http/backend-http.service';
import { ScheduleOpeningListResponse, ScheduleOpeningResponse } from './schedule.types';
import {
  CreateOpeningBody,
  CreateOpeningBodySchema,
  ListOpeningsQuery,
  ListOpeningsQuerySchema,
} from './schedule-opening.schemas';

// Request Zod schemas moved to schedule-opening.schemas.ts (TD37-S10) — re-exported here so
// existing imports of these symbols from this file keep working unchanged.
export * from './schedule-opening.schemas';

@Controller('schedule/openings')
@Roles('MANAGER', 'STAFF')
export class ScheduleOpeningController {
  constructor(private readonly backendHttp: BackendHttpService) {}

  @Get()
  list(
    @Query(new ZodValidationPipe(ListOpeningsQuerySchema)) query: ListOpeningsQuery,
  ): Promise<ScheduleOpeningListResponse> {
    return this.backendHttp.get<ScheduleOpeningListResponse>('/schedule/openings', query);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(
    @Body(new ZodValidationPipe(CreateOpeningBodySchema)) body: CreateOpeningBody,
  ): Promise<ScheduleOpeningResponse> {
    return this.backendHttp.post<ScheduleOpeningResponse>('/schedule/openings', body);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id', CanonicalParseUUIDPipe) id: string): Promise<void> {
    return this.backendHttp.delete<void>(`/schedule/openings/${id}`);
  }
}
