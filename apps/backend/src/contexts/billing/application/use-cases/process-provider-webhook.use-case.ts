import { Inject, Injectable } from '@nestjs/common';
import {
  ProviderWebhookProcessor,
  type ProviderWebhookInput,
  type ProviderWebhookResult,
} from '../services/provider-webhook-processor.service';

export type ProcessProviderWebhookUseCaseInput = ProviderWebhookInput;

/**
 * Every outcome is a `200` to the provider; only a thrown error (the provider re-read failed, the
 * database is down) answers non-2xx so the provider retries.
 */
export type ProcessProviderWebhookUseCaseResult = ProviderWebhookResult;

/** UC-114: the provider's webhook. The work is `ProviderWebhookProcessor`, shared with dev `simulate`. */
@Injectable()
export class ProcessProviderWebhookUseCase {
  constructor(
    @Inject(ProviderWebhookProcessor)
    private readonly processor: Pick<ProviderWebhookProcessor, 'execute'>,
  ) {}

  execute(input: ProcessProviderWebhookUseCaseInput): Promise<ProcessProviderWebhookUseCaseResult> {
    return this.processor.execute(input);
  }
}
