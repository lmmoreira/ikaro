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
import { z } from 'zod';
import { Roles } from '../../shared/decorators/roles.decorator';
import { CanonicalParseUUIDPipe } from '@ikaro/types';
import { ZodValidationPipe } from '../../shared/http/zod-validation.pipe';
import { BackendHttpService } from '../../shared/http/backend-http.service';
import { ScheduleOpeningListResponse, ScheduleOpeningResponse } from './schedule.types';

const CreateOpeningBodySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'date must be YYYY-MM-DD'),
  startTime: z.string().regex(/^\d{2}:\d{2}$/, 'startTime must be HH:MM'),
  endTime: z.string().regex(/^\d{2}:\d{2}$/, 'endTime must be HH:MM'),
  notes: z.string().optional(),
});

const ListOpeningsQuerySchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'from must be YYYY-MM-DD'),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'to must be YYYY-MM-DD'),
});

type CreateOpeningBody = z.infer<typeof CreateOpeningBodySchema>;
type ListOpeningsQuery = z.infer<typeof ListOpeningsQuerySchema>;

@Controller('schedule/openings')
@Roles('MANAGER', 'STAFF')
export class ScheduleOpeningController {
  constructor(private readonly backendHttp: BackendHttpService) {}

  @Get()
  list(
    @Query(new ZodValidationPipe(ListOpeningsQuerySchema)) query: ListOpeningsQuery,
  ): Promise<ScheduleOpeningListResponse> {
    return this.backendHttp.get<ScheduleOpeningListResponse>(
      `/schedule/openings?from=${query.from}&to=${query.to}`,
    );
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
