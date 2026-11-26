export const BILLING_SIGNUP_CONFIG = Symbol('BillingSignupConfig');

/**
 * The one deployment fact self-signup reads (UC-127, M26-S24): the Terms version a visitor must
 * accept. Fixed for the life of the process, so `BillingModule` provides it once as a plain value
 * (no port, no adapter), like `BillingProvisioningConfig`. Billing owns it because the accepted
 * version is stored on the registration, the legal record.
 */
export interface BillingSignupConfig {
  /** `SIGNUP_TERMS_VERSION`: the version the session read reports and the reserve step enforces. */
  readonly termsVersion: string;
}
