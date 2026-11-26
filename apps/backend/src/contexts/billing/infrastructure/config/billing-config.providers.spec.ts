import type { FactoryProvider } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { BILLING_PROVISIONING_CONFIG_PROVIDER } from './billing-config.providers';

function configOf(values: Record<string, string>): ConfigService {
  return {
    get: (key: string) => values[key],
    getOrThrow: (key: string) => {
      if (values[key] === undefined) throw new Error(`Missing ${key}`);
      return values[key];
    },
  } as unknown as ConfigService;
}

describe('Billing config providers', () => {
  describe('BILLING_PROVISIONING_CONFIG_PROVIDER', () => {
    const factory = (BILLING_PROVISIONING_CONFIG_PROVIDER as FactoryProvider).useFactory;

    it('carries the app env it is given and the owner slug from PLATFORM_OWNER_TENANT_SLUG', () => {
      expect(factory(configOf({ PLATFORM_OWNER_TENANT_SLUG: 'ikaro' }), 'staging')).toEqual({
        appEnv: 'staging',
        platformOwnerSlug: 'ikaro',
      });
    });

    it('has no owner slug when the variable is unset', () => {
      expect(factory(configOf({}), 'local')).toEqual({ appEnv: 'local', platformOwnerSlug: null });
    });
  });
});
