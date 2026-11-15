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
import { ScheduleClosureListResponse, ScheduleClosureResponse } from './schedule.types';
import {
  CreateClosureBody,
  CreateClosureBodySchema,
  ListClosuresQuery,
  ListClosuresQuerySchema,
} from './schedule.schemas';

// Request Zod schemas moved to schedule.schemas.ts — re-exported here so existing
// imports of these symbols from this file keep working unchanged.
export * from './schedule.schemas';

@Controller('schedule/closures')
@Roles('MANAGER', 'STAFF')
export class ScheduleController {
  constructor(private readonly backendHttp: BackendHttpService) {}

  @Get()
  list(
    @Query(new ZodValidationPipe(ListClosuresQuerySchema)) query: ListClosuresQuery,
  ): Promise<ScheduleClosureListResponse> {
    return this.backendHttp.get<ScheduleClosureListResponse>('/schedule/closures', query);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(
    @Body(new ZodValidationPipe(CreateClosureBodySchema)) body: CreateClosureBody,
  ): Promise<ScheduleClosureResponse> {
    return this.backendHttp.post<ScheduleClosureResponse>('/schedule/closures', body);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id', CanonicalParseUUIDPipe) id: string): Promise<void> {
    return this.backendHttp.delete<void>(`/schedule/closures/${id}`);
  }
}
