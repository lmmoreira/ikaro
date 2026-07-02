import { Module } from '@nestjs/common';
import { BackendHttpModule } from '../../shared/http/backend-http.module';
import { ScheduleAvailabilityController } from './schedule-availability.controller';
import { ScheduleAvailabilitySummaryController } from './schedule-availability-summary.controller';
import { ScheduleController } from './schedule.controller';
import { ScheduleOpeningController } from './schedule-opening.controller';

@Module({
  imports: [BackendHttpModule],
  controllers: [
    ScheduleController,
    ScheduleOpeningController,
    ScheduleAvailabilityController,
    ScheduleAvailabilitySummaryController,
  ],
})
export class ScheduleModule {}
