import { Module } from '@nestjs/common';
import { BackendHttpModule } from '../shared/http/backend-http.module';
import { CustomersController } from './customers.controller';

@Module({
  imports: [BackendHttpModule],
  controllers: [CustomersController],
})
export class CustomersModule {}
