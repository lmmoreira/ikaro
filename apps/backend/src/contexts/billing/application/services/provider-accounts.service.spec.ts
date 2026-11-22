import { AppLogger } from '../../../../shared/observability/app-logger';
import { FixedClock } from '../../../../test/infrastructure/fixed-clock';
import { InMemoryOutboxPublisher } from '../../../../test/infrastructure/in-memory-outbox-publisher';
import { InMemoryTransactionManager } from '../../../../test/infrastructure/in-memory-transaction-manager';
import { InMemorySubscriptionRepository } from '../../../../test/repositories/billing/in-memory-subscription.repository';
import { MerchantProfileKeyNotAllowedError } from '../../domain/errors/billing-provider.errors';
import { MERCHANT_PROFILE_KEYS } from '../../domain/merchant-profile-key';
import { BillingProviderRegistry } from '../../infrastructure/providers/billing-provider.registry';
import { FakeBillingProvider } from '../../infrastructure/providers/fake-billing.provider';
import { ProviderAccountsService } from './provider-accounts.service';

describe('ProviderAccountsService', () => {
  let subscriptions: InMemorySubscriptionRepository;
  let service: ProviderAccountsService;
  let warn: jest.SpyInstance;
  let error: jest.SpyInstance;

  const build = (appEnv: 'local' | 'staging' | 'production' = 'local') => {
    const registry = new BillingProviderRegistry(appEnv, new FakeBillingProvider(new FixedClock()));
    service = new ProviderAccountsService(subscriptions, registry);
  };

  beforeEach(() => {
    jest.restoreAllMocks();
    warn = jest.spyOn(AppLogger.prototype, 'warn').mockImplementation(() => undefined);
    error = jest.spyOn(AppLogger.prototype, 'error').mockImplementation(() => undefined);
    subscriptions = new InMemorySubscriptionRepository(
      new InMemoryOutboxPublisher(new InMemoryTransactionManager()),
    );
    build();
  });

  const keysAre = (keys: string[]) =>
    jest.spyOn(subscriptions, 'listMerchantProfileKeys').mockResolvedValue(keys);

  it('keeps the keys an adapter serves', async () => {
    keysAre([MERCHANT_PROFILE_KEYS.BRL_FAKE]);

    await expect(service.listServed()).resolves.toEqual([MERCHANT_PROFILE_KEYS.BRL_FAKE]);
    expect(warn).not.toHaveBeenCalled();
  });

  it('drops a key no adapter serves yet and logs it once at warn, never at error', async () => {
    keysAre([MERCHANT_PROFILE_KEYS.BRL_FAKE, MERCHANT_PROFILE_KEYS.BRL_ASAAS_SANDBOX]);

    await expect(service.listServed()).resolves.toEqual([MERCHANT_PROFILE_KEYS.BRL_FAKE]);

    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith('billing_provider_not_supported: skipped', {
      merchantProfileKey: MERCHANT_PROFILE_KEYS.BRL_ASAAS_SANDBOX,
    });
    expect(error).not.toHaveBeenCalled();
  });

  it('logs each dropped key once, whatever the number of keys', async () => {
    keysAre([
      MERCHANT_PROFILE_KEYS.BRL_ASAAS_SANDBOX,
      MERCHANT_PROFILE_KEYS.USD_STRIPE_TEST,
      MERCHANT_PROFILE_KEYS.USD_FAKE,
    ]);

    await expect(service.listServed()).resolves.toEqual([]);

    expect(warn).toHaveBeenCalledTimes(3);
  });

  it('returns an empty list when no subscription exists', async () => {
    keysAre([]);

    await expect(service.listServed()).resolves.toEqual([]);
    expect(warn).not.toHaveBeenCalled();
  });

  // Negative guarantee: only "no adapter" is skipped. A key that must not run in this environment
  // is a misconfiguration and stops the run.
  it('does not swallow a key the environment forbids', async () => {
    build('production');
    keysAre([MERCHANT_PROFILE_KEYS.BRL_FAKE]);

    await expect(service.listServed()).rejects.toBeInstanceOf(MerchantProfileKeyNotAllowedError);
  });
});
