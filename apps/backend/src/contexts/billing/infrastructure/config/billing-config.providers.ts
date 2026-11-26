import type { Provider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { type AppEnv } from '../../../../shared/database/resolve-app-env';
import {
  BILLING_PROVISIONING_CONFIG,
  type BillingProvisioningConfig,
} from '../../application/ports/billing-provisioning-config.port';
import { BILLING_APP_ENV } from '../providers/billing-provider.registry';

// A deployment fact that is fixed for the life of the process: one plain value, read once (no port,
// no adapter), listed here to keep `billing.module.ts` under its line cap.

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
