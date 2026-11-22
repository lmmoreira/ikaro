import { Inject, Injectable } from '@nestjs/common';
import { AppLogger } from '../../../../shared/observability/app-logger';
import { CLOCK, type IClock } from '../../../../shared/ports/clock.port';
import { providerOfMerchantProfileKey } from '../../domain/merchant-profile-key';
import type { ProviderWebhookStatus } from '../../domain/provider-health';
import {
  BILLING_PROVIDER_REGISTRY,
  type BillingProviderRegistryPort,
} from '../ports/billing-provider.port';
import {
  IProviderEventRepository,
  PROVIDER_EVENT_REPOSITORY,
} from '../ports/provider-event-repository.port';
import {
  IProviderHealthRepository,
  PROVIDER_HEALTH_REPOSITORY,
} from '../ports/provider-health-repository.port';

export interface CheckProviderHealthUseCaseInput {
  merchantProfileKey: string;
  now: Date;
  correlationId: string;
}

/** `RAISED`: the webhook is (or was, until a delivery succeeds) broken; `CLOSED`: it just recovered. */
export type WebhookAlertState = 'NONE' | 'RAISED' | 'CLOSED';

export interface CheckProviderHealthUseCaseResult {
  merchantProfileKey: string;
  /** `false` when the provider's health read failed (it counts toward the freeze). */
  readOk: boolean;
  webhookAlert: WebhookAlertState;
  /** The re-enable call was made this run (at most once per account per run). */
  reenableAttempted: boolean;
  reenableFailed: boolean;
}

/**
 * UC-140 step 2, for one provider account. Reads the account's webhook state; a paused webhook or
 * queue is re-enabled once through the API and the alert stays raised, because a cleared flag is
 * not recovery (a wrong token keeps answering `401` and pauses the queue again). The alert closes
 * only when a processed `provider_events` row newer than the re-enable exists. The stored
 * `webhook_status` is `PAUSED` for as long as the alert is open; the structured line below is what
 * S36's alert policy reads.
 *
 * A failed health read is not a failure of the step: it is a fact the freeze needs, so it
 * increments `health_read_failures` and the run carries on.
 */
@Injectable()
export class CheckProviderHealthUseCase {
  private readonly logger = new AppLogger(CheckProviderHealthUseCase.name);

  constructor(
    @Inject(BILLING_PROVIDER_REGISTRY) private readonly registry: BillingProviderRegistryPort,
    @Inject(PROVIDER_HEALTH_REPOSITORY) private readonly health: IProviderHealthRepository,
    @Inject(PROVIDER_EVENT_REPOSITORY) private readonly events: IProviderEventRepository,
    @Inject(CLOCK) private readonly clock: IClock,
  ) {}

  async execute(input: CheckProviderHealthUseCaseInput): Promise<CheckProviderHealthUseCaseResult> {
    const { merchantProfileKey, now } = input;
    const provider = this.registry.resolve(merchantProfileKey);

    let paused: boolean;
    let reported: ProviderWebhookStatus;
    try {
      const read = await provider.readAccountHealth(merchantProfileKey);
      paused = read.webhookStatus === 'PAUSED' || read.queuePaused;
      reported = read.webhookStatus;
    } catch (err) {
      return this.recordFailedRead(input, err);
    }

    const previous = await this.health.findByKey(merchantProfileKey);
    let result: CheckProviderHealthUseCaseResult;
    if (paused) {
      result = await this.reenable(input, provider);
    } else if (previous?.webhookStatus === 'PAUSED') {
      result = await this.closeIfDelivered(
        input,
        previous.webhookReenabledAt ?? previous.updatedAt,
        reported,
      );
    } else {
      await this.health.recordHealthReadOk(merchantProfileKey, reported, now, null);
      result = this.result(merchantProfileKey, 'NONE');
    }

    this.logger.log('billing_provider_health', {
      ...result,
      correlationId: input.correlationId,
    });
    return result;
  }

  // A failed read is a fact the freeze needs, not a failure of the step: count it and carry on.
  private async recordFailedRead(
    input: CheckProviderHealthUseCaseInput,
    err: unknown,
  ): Promise<CheckProviderHealthUseCaseResult> {
    const failures = await this.health.recordHealthReadFailure(input.merchantProfileKey, input.now);
    this.logger.warn('billing_provider_health_read_failed', {
      merchantProfileKey: input.merchantProfileKey,
      healthReadFailures: failures,
      correlationId: input.correlationId,
      error: err instanceof Error ? err.message : String(err),
    });
    return { ...this.result(input.merchantProfileKey, 'NONE'), readOk: false };
  }

  // The alert stays raised either way: only a later delivery closes it.
  private async reenable(
    input: CheckProviderHealthUseCaseInput,
    provider: { reenableWebhookQueue(merchantProfileKey: string): Promise<void> },
  ): Promise<CheckProviderHealthUseCaseResult> {
    const { merchantProfileKey, now } = input;
    let reenableFailed = false;
    try {
      await provider.reenableWebhookQueue(merchantProfileKey);
    } catch (err) {
      reenableFailed = true;
      this.logger.error('billing_webhook_reenable_failed', undefined, {
        merchantProfileKey,
        correlationId: input.correlationId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
    // Stamped after the call resolved: a delivery cannot predate a re-enable that has not happened.
    await this.health.recordHealthReadOk(merchantProfileKey, 'PAUSED', now, this.clock.now());
    return {
      ...this.result(merchantProfileKey, 'RAISED'),
      reenableAttempted: true,
      reenableFailed,
    };
  }

  private async closeIfDelivered(
    input: CheckProviderHealthUseCaseInput,
    reenabledAt: Date,
    reported: ProviderWebhookStatus,
  ): Promise<CheckProviderHealthUseCaseResult> {
    const { merchantProfileKey, now } = input;
    const delivered = await this.events.existsProcessedAfter(
      providerOfMerchantProfileKey(merchantProfileKey),
      reenabledAt,
    );
    if (!delivered) {
      // The provider says it is healthy again, but no delivery has proved it: the alert stays.
      await this.health.recordHealthReadOk(merchantProfileKey, 'PAUSED', now, null);
      return this.result(merchantProfileKey, 'RAISED');
    }
    await this.health.recordHealthReadOk(merchantProfileKey, reported, now, null);
    return this.result(merchantProfileKey, 'CLOSED');
  }

  private result(
    merchantProfileKey: string,
    webhookAlert: WebhookAlertState,
  ): CheckProviderHealthUseCaseResult {
    return {
      merchantProfileKey,
      readOk: true,
      webhookAlert,
      reenableAttempted: false,
      reenableFailed: false,
    };
  }
}
