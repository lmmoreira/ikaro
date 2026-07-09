import type { TenantSettingsResponse } from '@ikaro/types';
import { countrySpec } from '@ikaro/i18n';
import type { DateFormat } from '@ikaro/i18n';

export interface TenantFormattingConfig {
  readonly locale: string;
  readonly currency: string;
  readonly currencySymbol?: string;
  readonly timezone: string;
  readonly dateFormat: DateFormat;
  readonly timeFormat: '24h' | '12h';
}

export function resolveTenantFormatting(tenant: TenantSettingsResponse): TenantFormattingConfig {
  const spec = countrySpec(tenant.settings.localization.countryCode);
  return {
    locale: tenant.settings.localization.language,
    currency: tenant.settings.localization.currency,
    currencySymbol: tenant.settings.localization.currencySymbol,
    timezone: tenant.settings.businessHours.timezone,
    dateFormat: spec.dateFormat,
    timeFormat: spec.timeFormat,
  };
}

export function resolveWelcomeStaffScreenDays(tenant: TenantSettingsResponse): number {
  return tenant.settings.booking.welcomeStaffScreenDays ?? 14;
}
