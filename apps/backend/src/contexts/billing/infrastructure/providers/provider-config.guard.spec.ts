import { APP_ENVS, type AppEnv } from '../../../../shared/database/resolve-app-env';
import { MerchantProfileKeyNotAllowedError } from '../../domain/errors/billing-provider.errors';
import { MERCHANT_PROFILE_KEYS } from '../../domain/merchant-profile-key';
import { assertMerchantProfileKeyAllowed, providerKeyKind } from './provider-config.guard';

const NON_LIVE = [
  MERCHANT_PROFILE_KEYS.BRL_FAKE,
  MERCHANT_PROFILE_KEYS.USD_FAKE,
  MERCHANT_PROFILE_KEYS.BRL_ASAAS_SANDBOX,
  MERCHANT_PROFILE_KEYS.USD_STRIPE_TEST,
];
const LIVE = [MERCHANT_PROFILE_KEYS.BRL_ASAAS_LIVE, MERCHANT_PROFILE_KEYS.USD_STRIPE_LIVE];
const NON_PRODUCTION = APP_ENVS.filter((env): env is AppEnv => env !== 'production');

describe('providerKeyKind', () => {
  it.each([
    ['BRL_FAKE', 'FAKE'],
    ['USD_FAKE', 'FAKE'],
    ['BRL_ASAAS_SANDBOX', 'SANDBOX'],
    ['USD_STRIPE_TEST', 'SANDBOX'],
    ['BRL_ASAAS_LIVE', 'LIVE'],
    ['USD_STRIPE_LIVE', 'LIVE'],
    ['EUR_SOMETHING', null],
  ])('classifies %s as %s', (key, expected) => {
    expect(providerKeyKind(key)).toBe(expected);
  });
});

describe('assertMerchantProfileKeyAllowed', () => {
  it.each(NON_LIVE)('rejects %s in production', (key) => {
    expect(() => assertMerchantProfileKeyAllowed('production', key)).toThrow(
      MerchantProfileKeyNotAllowedError,
    );
  });

  it.each(LIVE)('accepts %s in production', (key) => {
    expect(() => assertMerchantProfileKeyAllowed('production', key)).not.toThrow();
  });

  it.each(NON_PRODUCTION.flatMap((env) => LIVE.map((key) => [env, key] as const)))(
    'rejects a live key outside production (%s, %s)',
    (env, key) => {
      expect(() => assertMerchantProfileKeyAllowed(env, key)).toThrow(
        MerchantProfileKeyNotAllowedError,
      );
    },
  );

  it.each(NON_PRODUCTION.flatMap((env) => NON_LIVE.map((key) => [env, key] as const)))(
    'accepts a fake or sandbox key outside production (%s, %s)',
    (env, key) => {
      expect(() => assertMerchantProfileKeyAllowed(env, key)).not.toThrow();
    },
  );

  it('leaves an unknown key to the registry, which has no adapter for it', () => {
    expect(() => assertMerchantProfileKeyAllowed('production', 'EUR_SOMETHING')).not.toThrow();
  });

  it('names the key and the environment in the error', () => {
    expect(() => assertMerchantProfileKeyAllowed('production', 'BRL_FAKE')).toThrow(
      /BRL_FAKE.*production/,
    );
  });
});
