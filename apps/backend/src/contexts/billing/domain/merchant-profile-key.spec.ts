import {
  LIVE_MERCHANT_PROFILE_KEYS,
  MerchantProfileKeyUnresolvedError,
  resolveMerchantProfileKey,
} from './merchant-profile-key';

describe('resolveMerchantProfileKey', () => {
  it.each([
    ['local', 'BR', 'BRL_FAKE'],
    ['local', 'US', 'USD_FAKE'],
    ['staging', 'BR', 'BRL_ASAAS_SANDBOX'],
    ['staging', 'US', 'USD_STRIPE_TEST'],
    ['production', 'BR', 'BRL_ASAAS_LIVE'],
    ['production', 'US', 'USD_STRIPE_LIVE'],
  ])('maps %s + %s to %s', (appEnv, countryCode, expected) => {
    expect(resolveMerchantProfileKey(appEnv, countryCode)).toBe(expected);
  });

  it.each(['local', 'staging'])('never resolves %s to a live key', (appEnv) => {
    for (const countryCode of ['BR', 'US']) {
      expect(LIVE_MERCHANT_PROFILE_KEYS).not.toContain(
        resolveMerchantProfileKey(appEnv, countryCode),
      );
    }
  });

  it('resolves production to a live key for every supported country', () => {
    for (const countryCode of ['BR', 'US']) {
      expect(LIVE_MERCHANT_PROFILE_KEYS).toContain(
        resolveMerchantProfileKey('production', countryCode),
      );
    }
  });

  it.each([
    ['prod', 'BR'],
    ['ci', 'BR'],
    ['', 'BR'],
    ['toString', 'BR'],
    ['local', 'AR'],
    ['local', 'br'],
    ['local', ''],
  ])('throws a typed error for appEnv="%s" countryCode="%s"', (appEnv, countryCode) => {
    expect(() => resolveMerchantProfileKey(appEnv, countryCode)).toThrow(
      MerchantProfileKeyUnresolvedError,
    );
  });

  it('keeps the error identity across the prototype chain and names both inputs', () => {
    try {
      resolveMerchantProfileKey('prod', 'AR');
      throw new Error('expected resolveMerchantProfileKey to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(MerchantProfileKeyUnresolvedError);
      expect((error as MerchantProfileKeyUnresolvedError).message).toBe(
        'No merchant profile key for appEnv="prod" and countryCode="AR"',
      );
    }
  });
});
