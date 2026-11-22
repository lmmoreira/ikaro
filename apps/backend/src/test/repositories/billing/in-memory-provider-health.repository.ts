import { IProviderHealthRepository } from '../../../contexts/billing/application/ports/provider-health-repository.port';
import { ProviderHealth } from '../../../contexts/billing/domain/provider-health';

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
        lastReconcileOkAt: at,
        lastFullReconcileAt: fullPass ? at : (current?.lastFullReconcileAt ?? null),
        updatedAt: at,
      }),
    );
  }
}
