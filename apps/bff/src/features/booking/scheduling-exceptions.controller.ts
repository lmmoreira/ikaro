import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Query } from '@nestjs/common';
import { CanonicalParseUUIDPipe, ZodValidationPipe } from '@ikaro/nestjs-http';
import { Roles } from '../../shared/decorators/roles.decorator';
import { BackendHttpService } from '../../shared/http/backend-http.service';
import {
  DismissSchedulingExceptionsBody,
  DismissSchedulingExceptionsBodySchema,
  ListSchedulingExceptionsQuery,
  ListSchedulingExceptionsQuerySchema,
  ResolveSchedulingExceptionsBody,
  ResolveSchedulingExceptionsBodySchema,
} from './scheduling-exceptions.schemas';
import {
  SchedulingExceptionBulkResultResponse,
  SchedulingExceptionCountResponse,
  SchedulingExceptionListResponse,
} from './scheduling-exceptions.types';

export * from './scheduling-exceptions.schemas';

// A pass-through: the worklist item already carries the Booking-context summary the manager needs
// (docs/14-API_CONTRACTS.md § Future Commitment Exceptions), and every rule — the best-effort
// bulk, the per-entry outcomes — is the backend's. Bulk-only: a single entry is a list of one.
@Controller('scheduling-exceptions')
@Roles('MANAGER')
export class SchedulingExceptionsController {
  constructor(private readonly backendHttp: BackendHttpService) {}

  @Get()
  list(
    @Query(new ZodValidationPipe(ListSchedulingExceptionsQuerySchema))
    query: ListSchedulingExceptionsQuery,
  ): Promise<SchedulingExceptionListResponse> {
    return this.backendHttp.get<SchedulingExceptionListResponse>('/scheduling-exceptions', query);
  }

  // The sidebar badge: a count query on the backend, never the whole list.
  @Get('count')
  count(): Promise<SchedulingExceptionCountResponse> {
    return this.backendHttp.get<SchedulingExceptionCountResponse>('/scheduling-exceptions/count');
  }

  // M23-S46: the open entries of one booking (with alternatives) for the booking detail's decision
  // panel, so the page never loads and recomputes the whole worklist to use one entry.
  @Get('by-booking/:bookingId')
  listForBooking(
    @Param('bookingId', CanonicalParseUUIDPipe) bookingId: string,
  ): Promise<SchedulingExceptionListResponse> {
    return this.backendHttp.get<SchedulingExceptionListResponse>(
      `/scheduling-exceptions/by-booking/${bookingId}`,
    );
  }

  @Post('resolve')
  @HttpCode(HttpStatus.OK)
  resolve(
    @Body(new ZodValidationPipe(ResolveSchedulingExceptionsBodySchema))
    body: ResolveSchedulingExceptionsBody,
  ): Promise<SchedulingExceptionBulkResultResponse> {
    return this.backendHttp.post<SchedulingExceptionBulkResultResponse>(
      '/scheduling-exceptions/resolve',
      body,
    );
  }

  @Post('dismiss')
  @HttpCode(HttpStatus.OK)
  dismiss(
    @Body(new ZodValidationPipe(DismissSchedulingExceptionsBodySchema))
    body: DismissSchedulingExceptionsBody,
  ): Promise<SchedulingExceptionBulkResultResponse> {
    return this.backendHttp.post<SchedulingExceptionBulkResultResponse>(
      '/scheduling-exceptions/dismiss',
      body,
    );
  }
}
