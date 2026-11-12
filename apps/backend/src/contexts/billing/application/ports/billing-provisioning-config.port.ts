import type { MerchantProfileAppEnv } from '../../domain/merchant-profile-key';

export const BILLING_PROVISIONING_CONFIG = Symbol('BillingProvisioningConfig');

/**
 * The two deployment facts a new subscription is created from. Both are fixed for the life of the
 * process, so `BillingModule` provides them once as a plain value (no port, no adapter): the use
 * case never reads `process.env`.
 */
export interface BillingProvisioningConfig {
  /**
   * `APP_ENV`: with the country it decides the merchant profile. It comes from the module's one
   * `BILLING_APP_ENV` value (the strictly resolved one the provider registry uses), never from a
   * second read of the environment.
   */
  readonly appEnv: MerchantProfileAppEnv;
  /** The slug of Ikaro's own tenant, whose subscription is permanently exempt; `null` when unset. */
  readonly platformOwnerSlug: string | null;
}
