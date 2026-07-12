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
  UseGuards,
} from '@nestjs/common';
import { CanonicalParseUUIDPipe } from '@ikaro/nestjs-http';
import { ZodValidationPipe } from '../../../../shared/http/zod-validation.pipe';
import { RequestContext } from '../../../../shared/request/request-context';
import {
  CloseScheduleDto,
  CloseScheduleSchema,
  ListClosuresDto,
  ListClosuresSchema,
} from '../../application/dtos/close-schedule.dto';
import {
  CloseScheduleUseCase,
  CloseScheduleUseCaseResult,
} from '../../application/use-cases/close-schedule.use-case';
import {
  ListClosuresUseCase,
  ListClosuresUseCaseResult,
} from '../../application/use-cases/list-closures.use-case';
import { RemoveClosureUseCase } from '../../application/use-cases/remove-closure.use-case';
import { StaffOrManagerRoleGuard } from '../../../../shared/guards/staff-or-manager-role.guard';
import { mapBookingError } from '../http/booking-error.mapper';

@Controller('schedule/closures')
@UseGuards(StaffOrManagerRoleGuard)
export class ScheduleClosureController {
  constructor(
    private readonly ctx: RequestContext,
    private readonly closeSchedule: CloseScheduleUseCase,
    private readonly removeClosure: RemoveClosureUseCase,
    private readonly listClosures: ListClosuresUseCase,
  ) {}

  @Get()
  list(
    @Query(new ZodValidationPipe(ListClosuresSchema)) query: ListClosuresDto,
  ): Promise<ListClosuresUseCaseResult> {
    const { tenantId } = this.ctx;
    return this.listClosures.execute({ ...query, tenantId }).catch(mapBookingError);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(
    @Body(new ZodValidationPipe(CloseScheduleSchema)) body: CloseScheduleDto,
  ): Promise<CloseScheduleUseCaseResult> {
    const { tenantId, actorId: createdBy } = this.ctx;
    return this.closeSchedule
      .execute({ ...body, tenantId, createdBy: createdBy ?? '' })
      .catch(mapBookingError);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id', CanonicalParseUUIDPipe) id: string): Promise<void> {
    const { tenantId } = this.ctx;
    return this.removeClosure.execute({ id, tenantId }).catch(mapBookingError);
  }
}
