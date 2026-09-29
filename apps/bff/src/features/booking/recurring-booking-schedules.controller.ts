import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { CanonicalParseUUIDPipe, ZodValidationPipe } from '@ikaro/nestjs-http';
import { Roles } from '../../shared/decorators/roles.decorator';
import { BackendHttpService } from '../../shared/http/backend-http.service';
import {
  EndRecurringBookingScheduleResponse,
  RecurringBookingScheduleListResponse,
  RecurringBookingScheduleResponse,
  SkipOrRescheduleOccurrenceResponse,
} from './recurring-booking-schedules.types';
import {
  ListRecurringBookingSchedulesQuery,
  ListRecurringBookingSchedulesQuerySchema,
  OccurrenceStartParamSchema,
  RequestRecurringBookingScheduleBody,
  RequestRecurringBookingScheduleBodySchema,
  SkipOrRescheduleOccurrenceBody,
  SkipOrRescheduleOccurrenceBodySchema,
} from './recurring-booking-schedules.schemas';

export * from './recurring-booking-schedules.schemas';

// Thin proxy — every actor-scoping decision (customer sees own vs. staff/manager sees all,
// staff-on-behalf customerId) is made backend-side (RecurringBookingScheduleController), matching
// docs/24-BFF_ARCHITECTURE.md's "BFF orchestrates, backend decides" split for this endpoint.
@Controller('recurring-booking-schedules')
@Roles('CUSTOMER', 'MANAGER', 'STAFF')
export class RecurringBookingSchedulesController {
  constructor(private readonly backendHttp: BackendHttpService) {}

  @Get()
  list(
    @Query(new ZodValidationPipe(ListRecurringBookingSchedulesQuerySchema))
    query: ListRecurringBookingSchedulesQuery,
  ): Promise<RecurringBookingScheduleListResponse> {
    return this.backendHttp.get<RecurringBookingScheduleListResponse>(
      '/recurring-booking-schedules',
      query,
    );
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  request(
    @Body(new ZodValidationPipe(RequestRecurringBookingScheduleBodySchema))
    body: RequestRecurringBookingScheduleBody,
  ): Promise<RecurringBookingScheduleResponse> {
    return this.backendHttp.post<RecurringBookingScheduleResponse>(
      '/recurring-booking-schedules',
      body,
    );
  }

  @Patch(':id/occurrences/:occurrenceStart')
  skipOrReschedule(
    @Param('id', CanonicalParseUUIDPipe) id: string,
    @Param('occurrenceStart', new ZodValidationPipe(OccurrenceStartParamSchema))
    occurrenceStart: string,
    @Body(new ZodValidationPipe(SkipOrRescheduleOccurrenceBodySchema))
    body: SkipOrRescheduleOccurrenceBody,
  ): Promise<SkipOrRescheduleOccurrenceResponse> {
    return this.backendHttp.patch<SkipOrRescheduleOccurrenceResponse>(
      `/recurring-booking-schedules/${id}/occurrences/${encodeURIComponent(occurrenceStart)}`,
      body,
    );
  }

  @Post(':id/end')
  @HttpCode(HttpStatus.OK)
  end(
    @Param('id', CanonicalParseUUIDPipe) id: string,
  ): Promise<EndRecurringBookingScheduleResponse> {
    return this.backendHttp.post<EndRecurringBookingScheduleResponse>(
      `/recurring-booking-schedules/${id}/end`,
      {},
    );
  }
}
