import {
  ProviderHealth,
  type ProviderWebhookStatus,
} from '../../../contexts/billing/domain/provider-health';

/** A healthy provider account: no freeze, webhooks OK, reconciled a minute ago. */
export class ProviderHealthBuilder {
  private merchantProfileKey = 'BRL_FAKE';
  // Relative to now, never a calendar date.
  private lastReconcileOkAt: Date | null = new Date(Date.now() - 60_000);
  private lastFullReconcileAt: Date | null = new Date(Date.now() - 60_000);
  private webhookStatus: ProviderWebhookStatus = 'OK';
  private freezeSince: Date | null = null;
  private healthReadFailures = 0;
  private updatedAt = new Date(Date.now() - 1000);

  withMerchantProfileKey(merchantProfileKey: string): this {
    this.merchantProfileKey = merchantProfileKey;
    return this;
  }

  withLastReconcileOkAt(lastReconcileOkAt: Date | null): this {
    this.lastReconcileOkAt = lastReconcileOkAt;
    return this;
  }

  withLastFullReconcileAt(lastFullReconcileAt: Date | null): this {
    this.lastFullReconcileAt = lastFullReconcileAt;
    return this;
  }

  withWebhookStatus(webhookStatus: ProviderWebhookStatus): this {
    this.webhookStatus = webhookStatus;
    return this;
  }

  /** The freeze is on from this instant; `freezeActive` follows it (the table's CHECK keeps them together). */
  withFreeze(freezeSince: Date | null): this {
    this.freezeSince = freezeSince;
    return this;
  }

  withHealthReadFailures(healthReadFailures: number): this {
    this.healthReadFailures = healthReadFailures;
    return this;
  }

  withUpdatedAt(updatedAt: Date): this {
    this.updatedAt = updatedAt;
    return this;
  }

  build(): ProviderHealth {
    return ProviderHealth.reconstitute({
      merchantProfileKey: this.merchantProfileKey,
      lastReconcileOkAt: this.lastReconcileOkAt,
      lastFullReconcileAt: this.lastFullReconcileAt,
      webhookStatus: this.webhookStatus,
      freezeActive: this.freezeSince !== null,
      freezeSince: this.freezeSince,
      healthReadFailures: this.healthReadFailures,
      updatedAt: this.updatedAt,
    });
  }
}
