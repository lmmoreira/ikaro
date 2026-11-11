import type { AppEnv } from '../../../../shared/database/resolve-app-env';
import { MerchantProfileKeyNotAllowedError } from '../../domain/errors/billing-provider.errors';
import { LIVE_MERCHANT_PROFILE_KEYS } from '../../domain/merchant-profile-key';

export type ProviderKeyKind = 'FAKE' | 'SANDBOX' | 'LIVE';

const LIVE_KEYS: ReadonlySet<string> = new Set(LIVE_MERCHANT_PROFILE_KEYS);

const NON_LIVE_SUFFIXES: ReadonlyArray<readonly [string, ProviderKeyKind]> = [
  ['_FAKE', 'FAKE'],
  ['_SANDBOX', 'SANDBOX'],
  ['_TEST', 'SANDBOX'],
];

/** `null` for a key this code does not know; the registry then has no adapter for it. */
export function providerKeyKind(merchantProfileKey: string): ProviderKeyKind | null {
  if (LIVE_KEYS.has(merchantProfileKey)) return 'LIVE';
  const match = NON_LIVE_SUFFIXES.find(([suffix]) => merchantProfileKey.endsWith(suffix));
  return match?.[1] ?? null;
}

/**
 * The key is a database column on the subscription, so `env.validation.ts` cannot see it; this
 * guard is where it meets `APP_ENV`. A fake, sandbox or test key never runs in production and a
 * live key never runs anywhere else.
 */
export function assertMerchantProfileKeyAllowed(appEnv: AppEnv, merchantProfileKey: string): void {
  const kind = providerKeyKind(merchantProfileKey);
  if (kind === null) return;
  const live = kind === 'LIVE';
  if (live !== (appEnv === 'production')) {
    throw new MerchantProfileKeyNotAllowedError(merchantProfileKey, appEnv);
  }
}

/** A live adapter refuses to start unless `APP_ENV=production`. */
export function assertAdapterMayStart(appEnv: AppEnv, merchantProfileKey: string): void {
  if (providerKeyKind(merchantProfileKey) === 'LIVE' && appEnv !== 'production') {
    throw new MerchantProfileKeyNotAllowedError(merchantProfileKey, appEnv);
  }
}
