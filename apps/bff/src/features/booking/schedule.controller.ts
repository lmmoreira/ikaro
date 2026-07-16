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
import { CanonicalParseUUIDPipe, ZodValidationPipe } from '@ikaro/nestjs-http';
import { BackendHttpService } from '../../shared/http/backend-http.service';
import { ScheduleClosureListResponse, ScheduleClosureResponse } from './schedule.types';

const CreateClosureBodySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'date must be YYYY-MM-DD'),
  reason: z.enum(['STAFF_DAY_OFF', 'MAINTENANCE', 'HOLIDAY']),
  startTime: z
    .string()
    .regex(/^\d{2}:\d{2}$/, 'startTime must be HH:MM')
    .optional(),
  endTime: z
    .string()
    .regex(/^\d{2}:\d{2}$/, 'endTime must be HH:MM')
    .optional(),
  notes: z.string().optional(),
});

const ListClosuresQuerySchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'from must be YYYY-MM-DD'),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'to must be YYYY-MM-DD'),
});

type CreateClosureBody = z.infer<typeof CreateClosureBodySchema>;
type ListClosuresQuery = z.infer<typeof ListClosuresQuerySchema>;

@Controller('schedule/closures')
@Roles('MANAGER', 'STAFF')
export class ScheduleController {
  constructor(private readonly backendHttp: BackendHttpService) {}

  @Get()
  list(
    @Query(new ZodValidationPipe(ListClosuresQuerySchema)) query: ListClosuresQuery,
  ): Promise<ScheduleClosureListResponse> {
    return this.backendHttp.get<ScheduleClosureListResponse>(
      `/schedule/closures?from=${query.from}&to=${query.to}`,
    );
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
