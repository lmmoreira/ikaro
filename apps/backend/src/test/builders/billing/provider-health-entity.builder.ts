import { ProviderHealthEntity } from '../../../contexts/billing/infrastructure/entities/provider-health.entity';

export class ProviderHealthEntityBuilder {
  private merchantProfileKey = 'BRL_FAKE';
  private lastReconcileOkAt: Date | null = new Date(Date.now() - 60_000);
  private lastFullReconcileAt: Date | null = new Date(Date.now() - 60_000);
  private webhookStatus = 'OK';
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

  withWebhookStatus(webhookStatus: string): this {
    this.webhookStatus = webhookStatus;
    return this;
  }

  /** The freeze is on: `freeze_active` and `freeze_since` always move together (the table's CHECK). */
  withFreeze(freezeSince: Date): this {
    this.freezeActive = true;
    this.freezeSince = freezeSince;
    return this;
  }

  build(): ProviderHealthEntity {
    const e = new ProviderHealthEntity();
    e.merchantProfileKey = this.merchantProfileKey;
    e.lastReconcileOkAt = this.lastReconcileOkAt;
    e.lastFullReconcileAt = this.lastFullReconcileAt;
    e.webhookStatus = this.webhookStatus;
    e.freezeActive = this.freezeActive;
    e.freezeSince = this.freezeSince;
    e.updatedAt = this.updatedAt;
    return e;
  }
}
