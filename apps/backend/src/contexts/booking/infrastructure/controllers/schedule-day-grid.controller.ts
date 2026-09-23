import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ZodValidationPipe } from '@ikaro/nestjs-http';
import { RequestContext } from '../../../../shared/request/request-context';
import { ManagerRoleGuard } from '../../../../shared/guards/manager-role.guard';
import {
  GetScheduleDayGridDto,
  GetScheduleDayGridSchema,
} from '../../application/dtos/get-schedule-day-grid.dto';
import {
  GetScheduleDayGridUseCase,
  GetScheduleDayGridUseCaseResult,
} from '../../application/use-cases/get-schedule-day-grid.use-case';
import { mapBookingError } from '../http/booking-error.mapper';

@Controller('schedule/day-grid')
@UseGuards(ManagerRoleGuard)
export class ScheduleDayGridController {
  constructor(
    private readonly ctx: RequestContext,
    private readonly getScheduleDayGrid: GetScheduleDayGridUseCase,
  ) {}

  @Get()
  get(
    @Query(new ZodValidationPipe(GetScheduleDayGridSchema)) dto: GetScheduleDayGridDto,
  ): Promise<GetScheduleDayGridUseCaseResult> {
    const { tenantId, settings } = this.ctx;
    return this.getScheduleDayGrid
      .execute({ ...dto, tenantId, timezone: settings.businessHours.timezone })
      .catch(mapBookingError);
  }
}
