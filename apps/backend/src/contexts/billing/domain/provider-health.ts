import type { ProviderAccountHealth } from './provider-events';

export type ProviderWebhookStatus = ProviderAccountHealth['webhookStatus'];

export interface ProviderHealthProps {
  /** The selling entity / provider account this row describes: the key, never a tenant (the table has no `tenant_id`). */
  merchantProfileKey: string;
  /** The last reconcile pass that completed with a successful provider call. */
  lastReconcileOkAt: Date | null;
  /** The last full reconcile pass (every open charge and every recently paid one). */
  lastFullReconcileAt: Date | null;
  webhookStatus: ProviderWebhookStatus;
  /** The suspension freeze (UC-140): no `NON_PAYMENT` suspension is applied while it is on. */
  freezeActive: boolean;
  /** When the freeze started; set exactly when `freezeActive` is (the table's CHECK). */
  freezeSince: Date | null;
  /** Consecutive failed provider health reads (UC-140): the second one starts the freeze; a success resets it. */
  healthReadFailures: number;
  updatedAt: Date;
}

/**
 * The health of one merchant profile's provider account: the facts reconcile (M26-S07) and
 * self-heal (M26-S08) write and the status sweep reads (UC-115 A4). One row per
 * `merchant_profile_key`, created lazily by the first health write: **no row means not frozen**.
 * A platform-wide table (no tenant), so a frozen profile never freezes another.
 */
export class ProviderHealth {
  readonly merchantProfileKey: string;
  readonly lastReconcileOkAt: Date | null;
  readonly lastFullReconcileAt: Date | null;
  readonly webhookStatus: ProviderWebhookStatus;
  readonly freezeActive: boolean;
  readonly freezeSince: Date | null;
  readonly healthReadFailures: number;
  readonly updatedAt: Date;

  private constructor(props: ProviderHealthProps) {
    this.merchantProfileKey = props.merchantProfileKey;
    this.lastReconcileOkAt = props.lastReconcileOkAt;
    this.lastFullReconcileAt = props.lastFullReconcileAt;
    this.webhookStatus = props.webhookStatus;
    this.freezeActive = props.freezeActive;
    this.freezeSince = props.freezeSince;
    this.healthReadFailures = props.healthReadFailures;
    this.updatedAt = props.updatedAt;
  }

  static reconstitute(props: ProviderHealthProps): ProviderHealth {
    return new ProviderHealth(props);
  }
}
