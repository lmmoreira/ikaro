import { Module } from '@nestjs/common';
import { BackendHttpModule } from '../../shared/http/backend-http.module';
import { BookingsController } from './bookings.controller';
import { BookingsGuestController } from './bookings-guest.controller';
import { BookingsAttachmentsController } from './bookings-attachments.controller';

@Module({
  imports: [BackendHttpModule],
  controllers: [BookingsController, BookingsGuestController, BookingsAttachmentsController],
})
export class BookingsModule {}
