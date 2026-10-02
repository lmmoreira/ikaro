import { Module } from '@nestjs/common';
import { BackendHttpModule } from '../../shared/http/backend-http.module';
import { BookingsController } from './bookings.controller';
import { BookingsGuestController } from './bookings-guest.controller';
import { BookingsAttachmentsController } from './bookings-attachments.controller';
import { BookingsNoShowController } from './bookings-no-show.controller';
import { RecurringBookingSchedulesController } from './recurring-booking-schedules.controller';
import { SchedulingExceptionsController } from './scheduling-exceptions.controller';

@Module({
  imports: [BackendHttpModule],
  controllers: [
    BookingsController,
    BookingsGuestController,
    BookingsAttachmentsController,
    BookingsNoShowController,
    RecurringBookingSchedulesController,
    SchedulingExceptionsController,
  ],
})
export class BookingsModule {}
