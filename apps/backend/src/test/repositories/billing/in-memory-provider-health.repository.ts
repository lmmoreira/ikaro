import { IProviderHealthRepository } from '../../../contexts/billing/application/ports/provider-health-repository.port';
import {
  ProviderHealth,
  type ProviderWebhookStatus,
} from '../../../contexts/billing/domain/provider-health';

/** One row per merchant profile key, like the table: a save replaces the row of that key. */
export class InMemoryProviderHealthRepository implements IProviderHealthRepository {
  readonly saved: ProviderHealth[] = [];

  async findByKey(merchantProfileKey: string): Promise<ProviderHealth | null> {
    return this.saved.find((row) => row.merchantProfileKey === merchantProfileKey) ?? null;
  }

  async listFrozenKeys(): Promise<string[]> {
    return this.saved
      .filter((row) => row.freezeActive)
      .map((row) => row.merchantProfileKey)
      .sort((a, b) => a.localeCompare(b));
  }

  async save(health: ProviderHealth): Promise<void> {
    this.replace(health);
  }

  private replace(health: ProviderHealth): void {
    const index = this.saved.findIndex(
      (row) => row.merchantProfileKey === health.merchantProfileKey,
    );
    if (index === -1) this.saved.push(health);
    else this.saved[index] = health;
  }

  // Column-scoped like the real upsert: the freeze and the webhook status of an existing row stay.
  async recordReconcileOk(merchantProfileKey: string, at: Date, fullPass: boolean): Promise<void> {
    // Read and replace without yielding, like the one upsert statement it stands for.
    const current = this.saved.find((row) => row.merchantProfileKey === merchantProfileKey);
    this.replace(
      ProviderHealth.reconstitute({
        merchantProfileKey,
        webhookStatus: current?.webhookStatus ?? 'UNKNOWN',
        freezeActive: current?.freezeActive ?? false,
        freezeSince: current?.freezeSince ?? null,
        healthReadFailures: current?.healthReadFailures ?? 0,
        webhookReenabledAt: current?.webhookReenabledAt ?? null,
        lastReconcileOkAt: at,
        lastFullReconcileAt: fullPass ? at : (current?.lastFullReconcileAt ?? null),
        updatedAt: at,
      }),
    );
  }

  async recordHealthReadOk(
    merchantProfileKey: string,
    webhookStatus: ProviderWebhookStatus,
    at: Date,
    reenabledAt: Date | null,
  ): Promise<void> {
    const current = this.saved.find((row) => row.merchantProfileKey === merchantProfileKey);
    this.replace(
      ProviderHealth.reconstitute({
        merchantProfileKey,
        lastReconcileOkAt: current?.lastReconcileOkAt ?? null,
        lastFullReconcileAt: current?.lastFullReconcileAt ?? null,
        webhookStatus,
        freezeActive: current?.freezeActive ?? false,
        freezeSince: current?.freezeSince ?? null,
        healthReadFailures: 0,
        webhookReenabledAt: reenabledAt ?? current?.webhookReenabledAt ?? null,
        updatedAt: current?.updatedAt ?? at,
      }),
    );
  }

  async recordHealthReadFailure(merchantProfileKey: string, at: Date): Promise<number> {
    const current = this.saved.find((row) => row.merchantProfileKey === merchantProfileKey);
    const failures = (current?.healthReadFailures ?? 0) + 1;
    this.replace(
      ProviderHealth.reconstitute({
        merchantProfileKey,
        lastReconcileOkAt: current?.lastReconcileOkAt ?? null,
        lastFullReconcileAt: current?.lastFullReconcileAt ?? null,
        webhookStatus: current?.webhookStatus ?? 'UNKNOWN',
        freezeActive: current?.freezeActive ?? false,
        freezeSince: current?.freezeSince ?? null,
        healthReadFailures: failures,
        webhookReenabledAt: current?.webhookReenabledAt ?? null,
        updatedAt: current?.updatedAt ?? at,
      }),
    );
    return failures;
  }

  async setFreeze(merchantProfileKey: string, since: Date | null): Promise<boolean> {
    const current = this.saved.find((row) => row.merchantProfileKey === merchantProfileKey);
    if (!current || current.freezeActive === (since !== null)) return false;
    // The same conditions the real statement checks when it clears.
    const clearable =
      current.healthReadFailures === 0 &&
      current.lastReconcileOkAt !== null &&
      current.freezeSince !== null &&
      current.lastReconcileOkAt.getTime() > current.freezeSince.getTime();
    if (since === null && !clearable) return false;
    this.replace(
      ProviderHealth.reconstitute({
        merchantProfileKey,
        lastReconcileOkAt: current.lastReconcileOkAt,
        lastFullReconcileAt: current.lastFullReconcileAt,
        webhookStatus: current.webhookStatus,
        freezeActive: since !== null,
        freezeSince: since,
        healthReadFailures: current.healthReadFailures,
        webhookReenabledAt: current?.webhookReenabledAt ?? null,
        updatedAt: current.updatedAt,
      }),
    );
    return true;
  }
}
