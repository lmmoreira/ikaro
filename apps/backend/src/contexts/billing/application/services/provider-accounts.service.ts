import { Inject, Injectable } from '@nestjs/common';
import { AppLogger } from '../../../../shared/observability/app-logger';
import { MerchantProfileKeyNotAllowedError } from '../../domain/errors/billing-provider.errors';
import {
  BILLING_PROVIDER_REGISTRY,
  type BillingProviderRegistryPort,
} from '../ports/billing-provider.port';
import {
  ISubscriptionRepository,
  SUBSCRIPTION_REPOSITORY,
} from '../ports/subscription-repository.port';

/**
 * The provider accounts a cron job works on: the distinct `merchant_profile_key`s subscriptions
 * use, minus the ones no adapter serves yet. Reconcile and self-heal both read it, so the filter
 * and its log line exist once.
 *
 * A key with no adapter (a staging sandbox key before M26-S37, a US key before M28, a live key
 * whose secret is unset) is dropped and logged at `warn`, once per call: a job that threw on it
 * would nack, retry and dead-letter a message no retry can fix. A dropped key gets no health row
 * and no freeze evaluation, because there is no provider to be unhealthy.
 *
 * Only "no adapter" drops a key. A key this environment forbids (a live key outside production, a
 * fake one in it) stays in the list: the step that uses it throws for that account alone, loudly,
 * and every other account is still processed in the same run.
 */
@Injectable()
export class ProviderAccountsService {
  private readonly logger = new AppLogger(ProviderAccountsService.name);

  constructor(
    @Inject(SUBSCRIPTION_REPOSITORY) private readonly subscriptions: ISubscriptionRepository,
    @Inject(BILLING_PROVIDER_REGISTRY) private readonly registry: BillingProviderRegistryPort,
  ) {}

  async listServed(): Promise<string[]> {
    const keys = await this.subscriptions.listMerchantProfileKeys();
    return keys.filter((merchantProfileKey) => {
      if (!this.hasNoAdapter(merchantProfileKey)) return true;
      this.logger.warn('billing_provider_not_supported: skipped', { merchantProfileKey });
      return false;
    });
  }

  private hasNoAdapter(merchantProfileKey: string): boolean {
    try {
      return this.registry.tryResolve(merchantProfileKey) === null;
    } catch (err) {
      if (err instanceof MerchantProfileKeyNotAllowedError) return false;
      throw err;
    }
  }
}
