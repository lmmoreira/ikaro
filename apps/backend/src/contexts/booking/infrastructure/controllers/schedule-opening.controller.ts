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
import { CanonicalParseUUIDPipe } from '../../../../shared/http/canonical-parse-pipes';
import { ZodValidationPipe } from '../../../../shared/http/zod-validation.pipe';
import { RequestContext } from '../../../../shared/request/request-context';
import {
  ListOpeningsDto,
  ListOpeningsSchema,
  OpenScheduleDto,
  OpenScheduleSchema,
} from '../../application/dtos/open-schedule.dto';
import {
  OpenScheduleUseCase,
  OpenScheduleUseCaseResult,
} from '../../application/use-cases/open-schedule.use-case';
import {
  ListOpeningsUseCase,
  ListOpeningsUseCaseResult,
} from '../../application/use-cases/list-openings.use-case';
import { RemoveScheduleOpeningUseCase } from '../../application/use-cases/remove-schedule-opening.use-case';
import { StaffOrManagerRoleGuard } from '../../../../shared/guards/staff-or-manager-role.guard';
import { mapBookingError } from '../http/booking-error.mapper';

@Controller('schedule/openings')
@UseGuards(StaffOrManagerRoleGuard)
export class ScheduleOpeningController {
  constructor(
    private readonly ctx: RequestContext,
    private readonly openSchedule: OpenScheduleUseCase,
    private readonly removeOpening: RemoveScheduleOpeningUseCase,
    private readonly listOpenings: ListOpeningsUseCase,
  ) {}

  @Get()
  list(
    @Query(new ZodValidationPipe(ListOpeningsSchema)) query: ListOpeningsDto,
  ): Promise<ListOpeningsUseCaseResult> {
    const { tenantId } = this.ctx;
    return this.listOpenings.execute({ ...query, tenantId }).catch(mapBookingError);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(
    @Body(new ZodValidationPipe(OpenScheduleSchema)) body: OpenScheduleDto,
  ): Promise<OpenScheduleUseCaseResult> {
    const { tenantId, actorId: createdBy, settings } = this.ctx;
    return this.openSchedule
      .execute({
        ...body,
        tenantId,
        createdBy: createdBy ?? '',
        businessHours: settings.businessHours,
      })
      .catch(mapBookingError);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id', CanonicalParseUUIDPipe) id: string): Promise<void> {
    const { tenantId } = this.ctx;
    return this.removeOpening.execute({ id, tenantId }).catch(mapBookingError);
  }
}
