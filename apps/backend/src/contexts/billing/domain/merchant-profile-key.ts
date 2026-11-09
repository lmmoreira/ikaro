/**
 * The immutable `merchant_profile_key` a new subscription is created with (M25-S07).
 *
 * The provider is a property of the key, not of the process and never of the tenant: the key is
 * chosen from the deployment environment and the tenant's country, once, at creation. S05's
 * backfill and S11's new-tenant handler both call `resolveMerchantProfileKey`; the provider
 * registry (S14) resolves a key to an adapter and refuses a live adapter outside production and a
 * fake / sandbox / test key inside it. The live names below are labels only: the adapters that
 * use them are M26 (Asaas) and M28 (Stripe).
 */
export type MerchantProfileAppEnv = 'local' | 'staging' | 'production';

export const MERCHANT_PROFILE_KEYS = {
  BRL_FAKE: 'BRL_FAKE',
  USD_FAKE: 'USD_FAKE',
  BRL_ASAAS_SANDBOX: 'BRL_ASAAS_SANDBOX',
  USD_STRIPE_TEST: 'USD_STRIPE_TEST',
  BRL_ASAAS_LIVE: 'BRL_ASAAS_LIVE',
  USD_STRIPE_LIVE: 'USD_STRIPE_LIVE',
} as const;

export type MerchantProfileKey = (typeof MERCHANT_PROFILE_KEYS)[keyof typeof MERCHANT_PROFILE_KEYS];

export const LIVE_MERCHANT_PROFILE_KEYS: readonly MerchantProfileKey[] = [
  MERCHANT_PROFILE_KEYS.BRL_ASAAS_LIVE,
  MERCHANT_PROFILE_KEYS.USD_STRIPE_LIVE,
];

type SupportedCountry = 'BR' | 'US';

const KEY_BY_ENV_AND_COUNTRY: Readonly<
  Record<MerchantProfileAppEnv, Readonly<Record<SupportedCountry, MerchantProfileKey>>>
> = {
  local: { BR: MERCHANT_PROFILE_KEYS.BRL_FAKE, US: MERCHANT_PROFILE_KEYS.USD_FAKE },
  staging: {
    BR: MERCHANT_PROFILE_KEYS.BRL_ASAAS_SANDBOX,
    US: MERCHANT_PROFILE_KEYS.USD_STRIPE_TEST,
  },
  production: {
    BR: MERCHANT_PROFILE_KEYS.BRL_ASAAS_LIVE,
    US: MERCHANT_PROFILE_KEYS.USD_STRIPE_LIVE,
  },
};

/**
 * Config-time failure: an environment or country with no merchant profile. Never surfaces over
 * HTTP (the inputs come from `APP_ENV` and a tenant row, not a request), so it carries no
 * `DomainErrorShape` code and needs no error-mapper entry.
 */
export class MerchantProfileKeyUnresolvedError extends Error {
  constructor(
    readonly appEnv: string,
    readonly countryCode: string,
  ) {
    super(`No merchant profile key for appEnv="${appEnv}" and countryCode="${countryCode}"`);
    Object.setPrototypeOf(this, new.target.prototype);
    this.name = 'MerchantProfileKeyUnresolvedError';
  }
}

function isMerchantProfileAppEnv(value: string): value is MerchantProfileAppEnv {
  return Object.hasOwn(KEY_BY_ENV_AND_COUNTRY, value);
}

function isSupportedCountry(value: string): value is SupportedCountry {
  return value === 'BR' || value === 'US';
}

export function resolveMerchantProfileKey(appEnv: string, countryCode: string): MerchantProfileKey {
  if (!isMerchantProfileAppEnv(appEnv) || !isSupportedCountry(countryCode)) {
    throw new MerchantProfileKeyUnresolvedError(appEnv, countryCode);
  }
  return KEY_BY_ENV_AND_COUNTRY[appEnv][countryCode];
}
