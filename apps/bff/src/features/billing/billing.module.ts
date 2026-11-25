import { Module } from '@nestjs/common';
import { BackendHttpModule } from '../../shared/http/backend-http.module';
import { BillingController } from './billing.controller';
import { BillingPublicController } from './billing.public.controller';
import { BillingWebhookPublicController } from './billing.webhook.public.controller';

@Module({
  imports: [BackendHttpModule],
  controllers: [BillingController, BillingPublicController, BillingWebhookPublicController],
})
export class BillingModule {}
