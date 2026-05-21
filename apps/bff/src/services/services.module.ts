import { Module } from '@nestjs/common';
import { BackendHttpModule } from '../shared/http/backend-http.module';
import { ServicesController } from './services.controller';

@Module({
  imports: [BackendHttpModule],
  controllers: [ServicesController],
})
export class ServicesModule {}
