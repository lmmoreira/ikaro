import { Module } from '@nestjs/common';
import { BackendHttpModule } from '../../shared/http/backend-http.module';
import { BillingController } from './billing.controller';

@Module({
  imports: [BackendHttpModule],
  controllers: [BillingController],
})
export class BillingModule {}
