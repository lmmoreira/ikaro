import { Module } from '@nestjs/common';
import { BackendHttpModule } from '../../shared/http/backend-http.module';
import { BillingController } from './billing.controller';
import { BillingWebhookPublicController } from './billing.webhook.public.controller';

@Module({
  imports: [BackendHttpModule],
  controllers: [BillingController, BillingWebhookPublicController],
})
export class BillingModule {}
