import { Module } from '@nestjs/common';
import { BackendHttpModule } from '../shared/http/backend-http.module';
import { ServicesController } from '../services/services.controller';
import { ServicesPublicController } from '../services/services.public.controller';

@Module({
  imports: [BackendHttpModule],
  controllers: [ServicesController, ServicesPublicController],
})
export class BookingServicesModule {}
