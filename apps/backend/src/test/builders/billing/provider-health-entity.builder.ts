import { ProviderHealthEntity } from '../../../contexts/billing/infrastructure/entities/provider-health.entity';

export class ProviderHealthEntityBuilder {
  private merchantProfileKey = 'BRL_FAKE';
  private lastReconcileOkAt: Date | null = new Date(Date.now() - 60_000);
  private lastFullReconcileAt: Date | null = new Date(Date.now() - 60_000);
  private webhookStatus = 'OK';
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

  withWebhookStatus(webhookStatus: string): this {
    this.webhookStatus = webhookStatus;
    return this;
  }

  /** The freeze is on from this instant; `freeze_active` follows it (the table's CHECK keeps them together). */
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

  build(): ProviderHealthEntity {
    const e = new ProviderHealthEntity();
    e.merchantProfileKey = this.merchantProfileKey;
    e.lastReconcileOkAt = this.lastReconcileOkAt;
    e.lastFullReconcileAt = this.lastFullReconcileAt;
    e.webhookStatus = this.webhookStatus;
    e.freezeActive = this.freezeSince !== null;
    e.freezeSince = this.freezeSince;
    e.healthReadFailures = this.healthReadFailures;
    e.updatedAt = this.updatedAt;
    return e;
  }
}
