import {
  Body,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { NoFeatureGate, SuspensionAccess, ZodValidationPipe } from '@ikaro/nestjs-http';
import { InternalApiGuard } from '../../../../shared/guards/internal-api.guard';
import {
  WEBHOOK_PROVIDER_BY_SLUG,
  WebhookProviderSlugSchema,
} from '../../application/dtos/provider-webhook.dto';
import { ProcessProviderWebhookUseCase } from '../../application/use-cases/process-provider-webhook.use-case';
import { mapBillingError } from '../http/billing-error.mapper';

// The provider's webhook, forwarded by the BFF after it verified the token (the backend never sees
// the token). Tenant-less: the tenant is resolved from the provider customer, so the route is open
// to every tenant, suspended ones included (a payment is what lifts a suspension). Exactly `200`
// after the commit, never Nest's `201` for a `POST`: Asaas counts every other 2xx as a failure and
// pauses its queue after 15 in a row (docs/ASAAS_PROVIDER.md A9). The correlation id is the one the
// correlation middleware set on the request.
@UseGuards(InternalApiGuard)
@NoFeatureGate()
@SuspensionAccess('ANY_AUTHENTICATED')
@Controller('internal/billing/webhooks')
export class InternalBillingWebhookController {
  constructor(private readonly processWebhook: ProcessProviderWebhookUseCase) {}

  @Post(':provider')
  @HttpCode(HttpStatus.OK)
  async receive(
    @Param('provider', new ZodValidationPipe(WebhookProviderSlugSchema)) providerSlug: string,
    @Body() body: unknown,
    @Headers() headers: Record<string, string | undefined>,
    @Headers('x-correlation-id') correlationId: string,
  ): Promise<void> {
    await this.processWebhook
      .execute({
        provider: WEBHOOK_PROVIDER_BY_SLUG[providerSlug],
        // The adapter reads the body: anything it cannot read is an acknowledged `200`, not a `400`.
        rawBody: JSON.stringify(body) ?? '',
        headers,
        correlationId,
      })
      .catch(mapBillingError);
  }
}
