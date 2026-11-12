import { FixedClock } from '../../../../test/infrastructure/fixed-clock';
import {
  MerchantProfileKeyNotAllowedError,
  ProviderNotSupportedError,
} from '../../domain/errors/billing-provider.errors';
import { MERCHANT_PROFILE_KEYS } from '../../domain/merchant-profile-key';
import { BillingProviderRegistry } from './billing-provider.registry';
import { FakeBillingProvider } from './fake-billing.provider';

function registryFor(appEnv: 'local' | 'staging' | 'production'): {
  registry: BillingProviderRegistry;
  fake: FakeBillingProvider;
} {
  const fake = new FakeBillingProvider(new FixedClock());
  return { registry: new BillingProviderRegistry(appEnv, fake), fake };
}

describe('BillingProviderRegistry', () => {
  it.each(['local', 'staging', 'production'] as const)(
    'is built in %s: the environment rule is enforced on lookup, never at startup',
    (appEnv) => {
      expect(() => registryFor(appEnv)).not.toThrow();
    },
  );

  it.each(['local', 'staging'] as const)('resolves BRL_FAKE to the fake in %s', (appEnv) => {
    const { registry, fake } = registryFor(appEnv);

    expect(registry.resolve(MERCHANT_PROFILE_KEYS.BRL_FAKE)).toBe(fake);
  });

  it.each([
    MERCHANT_PROFILE_KEYS.USD_FAKE,
    MERCHANT_PROFILE_KEYS.BRL_ASAAS_SANDBOX,
    MERCHANT_PROFILE_KEYS.USD_STRIPE_TEST,
  ])('has no adapter for %s yet and never falls back to the fake', (key) => {
    const { registry } = registryFor('local');

    expect(() => registry.resolve(key)).toThrow(ProviderNotSupportedError);
  });

  it('has no adapter for an unknown key', () => {
    const { registry } = registryFor('local');

    expect(() => registry.resolve('EUR_SOMETHING')).toThrow(ProviderNotSupportedError);
  });

  it.each([MERCHANT_PROFILE_KEYS.BRL_FAKE, MERCHANT_PROFILE_KEYS.BRL_ASAAS_SANDBOX])(
    'rejects %s in production',
    (key) => {
      const { registry } = registryFor('production');

      expect(() => registry.resolve(key)).toThrow(MerchantProfileKeyNotAllowedError);
    },
  );

  it.each([MERCHANT_PROFILE_KEYS.BRL_ASAAS_LIVE, MERCHANT_PROFILE_KEYS.USD_STRIPE_LIVE])(
    'rejects the live key %s outside production',
    (key) => {
      const { registry } = registryFor('staging');

      expect(() => registry.resolve(key)).toThrow(MerchantProfileKeyNotAllowedError);
    },
  );

  it.each([MERCHANT_PROFILE_KEYS.BRL_ASAAS_LIVE, MERCHANT_PROFILE_KEYS.USD_STRIPE_LIVE])(
    'accepts the live key %s in production but has no adapter for it yet',
    (key) => {
      const { registry } = registryFor('production');

      expect(() => registry.resolve(key)).toThrow(ProviderNotSupportedError);
    },
  );
});
