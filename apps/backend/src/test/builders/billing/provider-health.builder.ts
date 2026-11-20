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
  private freezeActive = false;
  private freezeSince: Date | null = null;
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

  /** The freeze is on: `freeze_active` and `freeze_since` always move together (the table's CHECK). */
  withFreeze(freezeSince: Date): this {
    this.freezeActive = true;
    this.freezeSince = freezeSince;
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
      freezeActive: this.freezeActive,
      freezeSince: this.freezeSince,
      updatedAt: this.updatedAt,
    });
  }
}
