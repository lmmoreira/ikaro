import { Module } from '@nestjs/common';
import { BackendHttpModule } from '../../shared/http/backend-http.module';
import { BookingsController } from './bookings.controller';

@Module({
  imports: [BackendHttpModule],
  controllers: [BookingsController],
})
export class BookingsModule {}
