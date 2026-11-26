import type { Provider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { type AppEnv } from '../../../../shared/database/resolve-app-env';
import {
  BILLING_PROVISIONING_CONFIG,
  type BillingProvisioningConfig,
} from '../../application/ports/billing-provisioning-config.port';
import {
  BILLING_SIGNUP_CONFIG,
  type BillingSignupConfig,
} from '../../application/ports/billing-signup-config.port';
import { BILLING_APP_ENV } from '../providers/billing-provider.registry';

// Deployment facts that are fixed for the life of the process: each is one plain value, read once
// (no port, no adapter), listed here to keep `billing.module.ts` under its line cap.

/**
 * What a new subscription is created from. `appEnv` is the module's own `BILLING_APP_ENV`, so Billing
 * has a single source for it; the owner slug is `PLATFORM_OWNER_TENANT_SLUG`.
 */
export const BILLING_PROVISIONING_CONFIG_PROVIDER: Provider = {
  provide: BILLING_PROVISIONING_CONFIG,
  inject: [ConfigService, BILLING_APP_ENV],
  useFactory: (config: ConfigService, appEnv: AppEnv): BillingProvisioningConfig => ({
    appEnv,
    platformOwnerSlug: config.get<string>('PLATFORM_OWNER_TENANT_SLUG') ?? null,
  }),
};

/** The Terms version a self-signup must accept (`SIGNUP_TERMS_VERSION`, the schema gives it a default). */
export const BILLING_SIGNUP_CONFIG_PROVIDER: Provider = {
  provide: BILLING_SIGNUP_CONFIG,
  inject: [ConfigService],
  useFactory: (config: ConfigService): BillingSignupConfig => ({
    termsVersion: config.getOrThrow<string>('SIGNUP_TERMS_VERSION'),
  }),
};
