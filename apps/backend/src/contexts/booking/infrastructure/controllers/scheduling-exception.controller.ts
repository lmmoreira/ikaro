import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CanonicalParseUUIDPipe, ZodValidationPipe } from '@ikaro/nestjs-http';
import { ManagerRoleGuard } from '../../../../shared/guards/manager-role.guard';
import { RequestContext } from '../../../../shared/request/request-context';
import {
  DismissSchedulingExceptionsDto,
  DismissSchedulingExceptionsSchema,
  ListSchedulingExceptionsDto,
  ListSchedulingExceptionsSchema,
  ResolveSchedulingExceptionsDto,
  ResolveSchedulingExceptionsSchema,
} from '../../application/dtos/scheduling-exception.dto';
import {
  CountFutureCommitmentExceptionsUseCase,
  CountFutureCommitmentExceptionsUseCaseResult,
} from '../../application/use-cases/count-future-commitment-exceptions.use-case';
import {
  DismissFutureCommitmentExceptionsUseCase,
  DismissFutureCommitmentExceptionsUseCaseResult,
} from '../../application/use-cases/dismiss-future-commitment-exceptions.use-case';
import {
  ListFutureCommitmentExceptionsUseCase,
  ListFutureCommitmentExceptionsUseCaseResult,
} from '../../application/use-cases/list-future-commitment-exceptions.use-case';
import {
  ResolveFutureCommitmentExceptionsUseCase,
  ResolveFutureCommitmentExceptionsUseCaseResult,
} from '../../application/use-cases/resolve-future-commitment-exceptions.use-case';
import { mapBookingError } from '../http/booking-error.mapper';
import { staffActorRole } from './staff-actor-role';

// UC-073/UC-077 — the manager's worklist of bookings a resource deactivation left needing a
// decision. Bulk-only: a single entry is a list of one.
@Controller('scheduling-exceptions')
@UseGuards(ManagerRoleGuard)
export class SchedulingExceptionController {
  constructor(
    private readonly ctx: RequestContext,
    private readonly listExceptions: ListFutureCommitmentExceptionsUseCase,
    private readonly countExceptions: CountFutureCommitmentExceptionsUseCase,
    private readonly resolveExceptions: ResolveFutureCommitmentExceptionsUseCase,
    private readonly dismissExceptions: DismissFutureCommitmentExceptionsUseCase,
  ) {}

  @Get()
  list(
    @Query(new ZodValidationPipe(ListSchedulingExceptionsSchema))
    query: ListSchedulingExceptionsDto,
  ): Promise<ListFutureCommitmentExceptionsUseCaseResult> {
    const { tenantId } = this.ctx;
    return this.listExceptions.execute({ tenantId, status: query.status }).catch(mapBookingError);
  }

  // The sidebar badge: open entries only, a count query rather than the list.
  @Get('count')
  count(): Promise<CountFutureCommitmentExceptionsUseCaseResult> {
    const { tenantId } = this.ctx;
    return this.countExceptions.execute({ tenantId }).catch(mapBookingError);
  }

  // M23-S46 — the open entries of ONE booking (normally one, several when the booking holds several
  // deactivated resources) with their alternatives: what the booking detail's decision panel needs,
  // without loading and recomputing the whole worklist. An unknown, other-tenant or unmarked
  // booking is an empty list, never a 404.
  @Get('by-booking/:bookingId')
  listForBooking(
    @Param('bookingId', CanonicalParseUUIDPipe) bookingId: string,
  ): Promise<ListFutureCommitmentExceptionsUseCaseResult> {
    const { tenantId } = this.ctx;
    return this.listExceptions
      .execute({ tenantId, status: 'OPEN', affectedBookingId: bookingId })
      .catch(mapBookingError);
  }

  @Post('resolve')
  @HttpCode(HttpStatus.OK)
  resolve(
    @Body(new ZodValidationPipe(ResolveSchedulingExceptionsSchema))
    body: ResolveSchedulingExceptionsDto,
  ): Promise<ResolveFutureCommitmentExceptionsUseCaseResult> {
    const { tenantId, actorId, actorRole, correlationId, settings } = this.ctx;
    return this.resolveExceptions
      .execute({
        tenantId,
        staffId: actorId!,
        actorRole: staffActorRole(actorRole),
        correlationId,
        timezone: settings.businessHours.timezone,
        businessHours: settings.businessHours,
        tenantServiceBufferMinutes: settings.booking.serviceBufferMinutes,
        exceptionIds: body.exceptionIds,
        resolutionType: body.resolutionType,
        reason: body.reason,
        target: body.target,
        scheduledAt: body.scheduledAt,
      })
      .catch(mapBookingError);
  }

  @Post('dismiss')
  @HttpCode(HttpStatus.OK)
  dismiss(
    @Body(new ZodValidationPipe(DismissSchedulingExceptionsSchema))
    body: DismissSchedulingExceptionsDto,
  ): Promise<DismissFutureCommitmentExceptionsUseCaseResult> {
    const { tenantId, actorId, correlationId } = this.ctx;
    return this.dismissExceptions
      .execute({
        tenantId,
        staffId: actorId!,
        correlationId,
        exceptionIds: body.exceptionIds,
        reason: body.reason,
      })
      .catch(mapBookingError);
  }
}
