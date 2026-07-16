import { Controller, Get, Query } from '@nestjs/common';
import { ZodValidationPipe } from '@ikaro/nestjs-http';
import { RequestContext } from '../../../../shared/request/request-context';
import {
  GetAvailabilitySummaryDto,
  GetAvailabilitySummarySchema,
} from '../../application/dtos/get-availability-summary.dto';
import { GetAvailabilitySummaryUseCase } from '../../application/use-cases/get-availability-summary.use-case';
import { mapBookingError } from '../http/booking-error.mapper';

@Controller('schedule/availability/summary')
export class ScheduleAvailabilitySummaryController {
  constructor(
    private readonly ctx: RequestContext,
    private readonly getAvailabilitySummary: GetAvailabilitySummaryUseCase,
  ) {}

  @Get()
  get(@Query(new ZodValidationPipe(GetAvailabilitySummarySchema)) dto: GetAvailabilitySummaryDto) {
    const { tenantId, settings } = this.ctx;
    return this.getAvailabilitySummary
      .execute({
        ...dto,
        tenantId,
        businessHours: settings.businessHours,
        slotGranularityMinutes: settings.booking.slotGranularityMinutes,
        serviceBufferMinutes: settings.booking.serviceBufferMinutes,
        maxBookingAdvanceDays: settings.booking.maxBookingAdvanceDays,
      })
      .catch(mapBookingError);
  }
}
