import { AppLogger } from '../../../../shared/observability/app-logger';
import { FixedClock } from '../../../../test/infrastructure/fixed-clock';
import { InMemoryOutboxPublisher } from '../../../../test/infrastructure/in-memory-outbox-publisher';
import { InMemoryTransactionManager } from '../../../../test/infrastructure/in-memory-transaction-manager';
import { InMemorySubscriptionRepository } from '../../../../test/repositories/billing/in-memory-subscription.repository';
import { MERCHANT_PROFILE_KEYS } from '../../domain/merchant-profile-key';
import { BillingProviderRegistry } from '../../infrastructure/providers/billing-provider.registry';
import { FakeBillingProvider } from '../../infrastructure/providers/fake-billing.provider';
import { ProviderAccountsService } from './provider-accounts.service';

describe('ProviderAccountsService', () => {
  let subscriptions: InMemorySubscriptionRepository;
  let service: ProviderAccountsService;
  let warn: jest.SpyInstance;
  let error: jest.SpyInstance;

  beforeEach(() => {
    jest.restoreAllMocks();
    warn = jest.spyOn(AppLogger.prototype, 'warn').mockImplementation(() => undefined);
    error = jest.spyOn(AppLogger.prototype, 'error').mockImplementation(() => undefined);
    subscriptions = new InMemorySubscriptionRepository(
      new InMemoryOutboxPublisher(new InMemoryTransactionManager()),
    );
    service = new ProviderAccountsService(
      subscriptions,
      new BillingProviderRegistry('local', new FakeBillingProvider(new FixedClock())),
    );
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

  // Only "no adapter" drops a key. A key the environment forbids stays in the list, so the step
  // that uses it fails for that account alone and the other accounts are still processed.
  it('keeps a key the environment forbids, so its own step fails loudly and alone', async () => {
    keysAre([MERCHANT_PROFILE_KEYS.BRL_ASAAS_LIVE, MERCHANT_PROFILE_KEYS.BRL_FAKE]);

    await expect(service.listServed()).resolves.toEqual([
      MERCHANT_PROFILE_KEYS.BRL_ASAAS_LIVE,
      MERCHANT_PROFILE_KEYS.BRL_FAKE,
    ]);
    expect(warn).not.toHaveBeenCalled();
  });

  it('rejects the list only for a failure other than "no adapter" or "key not allowed"', async () => {
    const registry = new BillingProviderRegistry(
      'production',
      new FakeBillingProvider(new FixedClock()),
    );
    jest.spyOn(registry, 'tryResolve').mockImplementation(() => {
      throw new Error('registry broke');
    });
    const production = new ProviderAccountsService(subscriptions, registry);
    keysAre([MERCHANT_PROFILE_KEYS.BRL_ASAAS_LIVE]);

    await expect(production.listServed()).rejects.toThrow('registry broke');
  });

  it('keeps a key production forbids in a production service too', async () => {
    const production = new ProviderAccountsService(
      subscriptions,
      new BillingProviderRegistry('production', new FakeBillingProvider(new FixedClock())),
    );
    keysAre([MERCHANT_PROFILE_KEYS.BRL_FAKE]);

    await expect(production.listServed()).resolves.toEqual([MERCHANT_PROFILE_KEYS.BRL_FAKE]);
  });
});
