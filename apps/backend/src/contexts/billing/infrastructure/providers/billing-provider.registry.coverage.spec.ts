import { FixedClock } from '../../../../test/infrastructure/fixed-clock';
import {
  MERCHANT_PROFILE_KEYS,
  resolveMerchantProfileKey,
} from '../../domain/merchant-profile-key';
import { BillingProviderRegistry } from './billing-provider.registry';
import { FakeBillingProvider } from './fake-billing.provider';

// A merchant profile key subscriptions can carry comes from `resolveMerchantProfileKey` (an
// environment and a country). Every background caller skips a key with no adapter at `warn`
// instead of failing, so a key that is added without its adapter would stay silent in production.
// This spec is what fails instead: every reachable key is served, or is named below.
//
// KEYS_WITHOUT_ADAPTER_YET shrinks, never grows: M26-S37 removes the live Asaas key when it
// registers the adapter, and M28 removes the Stripe ones (and `USD_FAKE`) as it registers each.
// When it is empty this spec is the permanent guard.
const KEYS_WITHOUT_ADAPTER_YET: ReadonlySet<string> = new Set([
  MERCHANT_PROFILE_KEYS.BRL_ASAAS_LIVE,
  MERCHANT_PROFILE_KEYS.USD_FAKE,
  MERCHANT_PROFILE_KEYS.USD_STRIPE_TEST,
  MERCHANT_PROFILE_KEYS.USD_STRIPE_LIVE,
]);

// Staging resolves `BRL_FAKE` for BR until M26-S37 registers the Asaas sandbox adapter and reverts
// it (M26-S13), so no environment reaches this key for now. It stays in the catalog: subscriptions
// created before the change carry it. S37 deletes this set and moves the key back into the list
// above, then out of it with the adapter.
const KEYS_NOT_REACHABLE_UNTIL_S37: ReadonlySet<string> = new Set([
  MERCHANT_PROFILE_KEYS.BRL_ASAAS_SANDBOX,
]);

const APP_ENVS = ['local', 'staging', 'production'] as const;
const COUNTRIES = ['BR', 'US'] as const;

// One registry per environment: the environment guard rejects a live key outside production, so a
// single registry cannot answer for every key.
const reachable = APP_ENVS.flatMap((appEnv) =>
  COUNTRIES.map((country) => ({
    appEnv,
    country,
    key: resolveMerchantProfileKey(appEnv, country),
  })),
);

function registryFor(appEnv: (typeof APP_ENVS)[number]): BillingProviderRegistry {
  return new BillingProviderRegistry(appEnv, new FakeBillingProvider(new FixedClock()));
}

describe('BillingProviderRegistry coverage of the merchant profile keys', () => {
  it.each(reachable)(
    '$key ($appEnv, $country) has an adapter, or is listed as having none yet',
    ({ appEnv, key }) => {
      const served = registryFor(appEnv).tryResolve(key) !== null;

      expect(served || KEYS_WITHOUT_ADAPTER_YET.has(key)).toBe(true);
    },
  );

  it.each([...KEYS_WITHOUT_ADAPTER_YET])(
    '%s is listed as having no adapter, and really has none: the list cannot go stale',
    (key) => {
      const { appEnv } = reachable.find((entry) => entry.key === key)!;

      expect(registryFor(appEnv).tryResolve(key)).toBeNull();
    },
  );

  it('a key no environment reaches yet still has no adapter: the exception cannot go stale', () => {
    for (const key of KEYS_NOT_REACHABLE_UNTIL_S37) {
      expect(reachable.map((entry) => entry.key)).not.toContain(key);
      expect(registryFor('staging').tryResolve(key)).toBeNull();
    }
  });

  it('every key of the catalog is reachable from an environment and a country, bar the named exception', () => {
    const reachableKeys = new Set(reachable.map((entry) => entry.key));

    expect(
      [...Object.values(MERCHANT_PROFILE_KEYS)].filter(
        (key) => !reachableKeys.has(key) && !KEYS_NOT_REACHABLE_UNTIL_S37.has(key),
      ),
    ).toEqual([]);
  });
});
