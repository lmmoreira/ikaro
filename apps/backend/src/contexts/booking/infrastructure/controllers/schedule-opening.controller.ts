import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ZodValidationPipe } from '../../../../shared/http/zod-validation.pipe';
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
import { StaffOrManagerRoleGuard } from '../guards/staff-or-manager-role.guard';
import { mapBookingError } from '../http/booking-error.mapper';

@Controller('schedule/openings')
@UseGuards(StaffOrManagerRoleGuard)
export class ScheduleOpeningController {
  constructor(
    private readonly openSchedule: OpenScheduleUseCase,
    private readonly removeOpening: RemoveScheduleOpeningUseCase,
    private readonly listOpenings: ListOpeningsUseCase,
  ) {}

  @Get()
  list(
    @Query(new ZodValidationPipe(ListOpeningsSchema)) query: ListOpeningsDto,
  ): Promise<ListOpeningsUseCaseResult> {
    return this.listOpenings.execute(query).catch(mapBookingError);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(
    @Body(new ZodValidationPipe(OpenScheduleSchema)) body: OpenScheduleDto,
  ): Promise<OpenScheduleUseCaseResult> {
    return this.openSchedule.execute(body).catch(mapBookingError);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @Param('id', new ParseUUIDPipe({ errorHttpStatusCode: HttpStatus.BAD_REQUEST })) id: string,
  ): Promise<void> {
    return this.removeOpening.execute(id).catch(mapBookingError);
  }
}
