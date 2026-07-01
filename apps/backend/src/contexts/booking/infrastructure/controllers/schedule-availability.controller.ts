import { Controller, Get, Query } from '@nestjs/common';
import { ZodValidationPipe } from '../../../../shared/http/zod-validation.pipe';
import { RequestContext } from '../../../../shared/request/request-context';
import {
  GetAvailabilityDto,
  GetAvailabilitySchema,
} from '../../application/dtos/get-availability.dto';
import { GetAvailabilityUseCase } from '../../application/use-cases/get-availability.use-case';
import { mapBookingError } from '../http/booking-error.mapper';

@Controller('schedule/availability')
export class ScheduleAvailabilityController {
  constructor(
    private readonly ctx: RequestContext,
    private readonly getAvailability: GetAvailabilityUseCase,
  ) {}

  @Get()
  get(@Query(new ZodValidationPipe(GetAvailabilitySchema)) dto: GetAvailabilityDto) {
    const { tenantId, settings } = this.ctx;
    return this.getAvailability
      .execute({
        ...dto,
        tenantId,
        businessHours: settings.businessHours,
        slotGranularityMinutes: settings.booking.slotGranularityMinutes,
        serviceBufferMinutes: settings.booking.serviceBufferMinutes,
      })
      .catch(mapBookingError);
  }
}
