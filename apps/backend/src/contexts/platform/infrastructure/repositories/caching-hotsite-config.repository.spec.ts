import { DataSource, EntityManager } from 'typeorm';
import { HotsiteConfigBuilder } from '../../../../test/builders/platform/hotsite-config.builder';
import { InMemoryHotsiteConfigRepository } from '../../../../test/repositories/platform/in-memory-hotsite-config.repository';
import { InMemoryCachePort } from '../../../../test/infrastructure/in-memory-cache.port';
import { TypeOrmTransactionManager } from '../../../../shared/infrastructure/typeorm-transaction-manager';
import { AppLogger } from '../../../../shared/observability/app-logger';
import { HotsiteModule } from '../../domain/hotsite-config.aggregate';
import { CachingHotsiteConfigRepository } from './caching-hotsite-config.repository';

const TENANT_ID = '01234567-0000-7000-8000-000000000001';
const CACHE_KEY = `platform:hotsite-config:modules-enabled:${TENANT_ID}`;

const LEAD_FORM_ENABLED: HotsiteModule = {
  type: 'LEAD_FORM',
  enabled: true,
  data: { title: 'Fale com a gente', ctaLabel: 'Preencher formulário' },
};

describe('CachingHotsiteConfigRepository', () => {
  let inner: InMemoryHotsiteConfigRepository;
  let cache: InMemoryCachePort;
  let repo: CachingHotsiteConfigRepository;

  beforeEach(() => {
    inner = new InMemoryHotsiteConfigRepository();
    cache = new InMemoryCachePort();
    repo = new CachingHotsiteConfigRepository(inner, cache);
  });

  it('serves isModuleEnabled from the cache when warmed, without ever querying the repository', async () => {
    // Deliberately not saved to `inner` — if the code mistakenly fell through to the repository
    // instead of reading the cache, it would find nothing and return null.
    await cache.set(CACHE_KEY, { LEAD_FORM: true });

    const result = await repo.isModuleEnabled(TENANT_ID, 'LEAD_FORM');

    expect(result).toBe(true);
  });

  it('returns null, without writing to the cache, when the tenant has no HotsiteConfig row', async () => {
    const result = await repo.isModuleEnabled(TENANT_ID, 'LEAD_FORM');

    expect(result).toBeNull();
    expect(cache.has(CACHE_KEY)).toBe(false);
  });

  it('falls through to the repository and warms the cache on a miss', async () => {
    const config = new HotsiteConfigBuilder()
      .withTenantId(TENANT_ID)
      .buildWithContent(undefined, [LEAD_FORM_ENABLED]);
    await inner.save(config);

    const result = await repo.isModuleEnabled(TENANT_ID, 'LEAD_FORM');

    expect(result).toBe(true);
    expect(cache.has(CACHE_KEY)).toBe(true);
  });

  it('returns false for a module type absent from the layout, once warmed', async () => {
    const config = new HotsiteConfigBuilder()
      .withTenantId(TENANT_ID)
      .buildWithContent(undefined, [LEAD_FORM_ENABLED]);
    await inner.save(config);

    const result = await repo.isModuleEnabled(TENANT_ID, 'CHATBOT');

    expect(result).toBe(false);
  });

  it('falls through to the repository when the cache backend fails', async () => {
    const config = new HotsiteConfigBuilder()
      .withTenantId(TENANT_ID)
      .buildWithContent(undefined, [LEAD_FORM_ENABLED]);
    await inner.save(config);
    const warnSpy = jest.spyOn(AppLogger.prototype, 'warn').mockImplementation();
    cache.failNextGet(new Error('cache unavailable'));

    const result = await repo.isModuleEnabled(TENANT_ID, 'LEAD_FORM');

    expect(result).toBe(true);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining(`Cache read failed for ${CACHE_KEY}`),
    );

    warnSpy.mockRestore();
  });

  it('still returns the fetched value when the cache write fails', async () => {
    const config = new HotsiteConfigBuilder()
      .withTenantId(TENANT_ID)
      .buildWithContent(undefined, [LEAD_FORM_ENABLED]);
    await inner.save(config);
    const warnSpy = jest.spyOn(AppLogger.prototype, 'warn').mockImplementation();
    cache.failNextSet('not an Error instance');

    const result = await repo.isModuleEnabled(TENANT_ID, 'LEAD_FORM');

    expect(result).toBe(true);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining(`Cache write failed for ${CACHE_KEY}: not an Error instance`),
    );

    warnSpy.mockRestore();
  });

  it('invalidates the cached module map after the transaction commits on save', async () => {
    const config = new HotsiteConfigBuilder()
      .withTenantId(TENANT_ID)
      .buildWithContent(undefined, [LEAD_FORM_ENABLED]);
    await inner.save(config);
    await repo.isModuleEnabled(TENANT_ID, 'LEAD_FORM');
    expect(cache.has(CACHE_KEY)).toBe(true);

    const mockDataSource = {
      transaction: jest.fn(async (fn: (em: EntityManager) => Promise<void>) => {
        const result = await fn({} as EntityManager);
        expect(cache.has(CACHE_KEY)).toBe(true);
        return result;
      }),
    } as unknown as DataSource;
    const txManager = new TypeOrmTransactionManager(mockDataSource);

    await txManager.run(async () => {
      await repo.save(config);
      expect(cache.has(CACHE_KEY)).toBe(true);
    });

    expect(cache.has(CACHE_KEY)).toBe(false);
  });

  it('does not throw when cache invalidation fails after save', async () => {
    const config = new HotsiteConfigBuilder().withTenantId(TENANT_ID).buildWithContent();
    const warnSpy = jest.spyOn(AppLogger.prototype, 'warn').mockImplementation();
    cache.failNextDel(new Error('cache unavailable'));
    const mockDataSource = {
      transaction: jest.fn(async (fn: (em: EntityManager) => Promise<void>) =>
        fn({} as EntityManager),
      ),
    } as unknown as DataSource;
    const txManager = new TypeOrmTransactionManager(mockDataSource);

    await expect(txManager.run(() => repo.save(config))).resolves.not.toThrow();

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining(`Cache invalidation failed for ${CACHE_KEY}: cache unavailable`),
    );

    warnSpy.mockRestore();
  });

  it('reflects a newly-disabled module only after the cache is invalidated by save()', async () => {
    const config = new HotsiteConfigBuilder()
      .withTenantId(TENANT_ID)
      .buildWithContent(undefined, [LEAD_FORM_ENABLED]);
    await inner.save(config);
    await repo.isModuleEnabled(TENANT_ID, 'LEAD_FORM');

    const disabled: HotsiteModule = { ...LEAD_FORM_ENABLED, enabled: false };
    config.updateContent(config.branding, [disabled], config.seo, {
      maxBookingAdvanceDays: 90,
    });
    await inner.save(config);
    const stillCached = await repo.isModuleEnabled(TENANT_ID, 'LEAD_FORM');
    expect(stillCached).toBe(true);

    await repo.save(config);
    const fresh = await repo.isModuleEnabled(TENANT_ID, 'LEAD_FORM');
    expect(fresh).toBe(false);
  });

  it('delegates findByTenantId/findByTenantIds without ever caching them', async () => {
    const config = new HotsiteConfigBuilder()
      .withTenantId(TENANT_ID)
      .buildWithContent(undefined, [LEAD_FORM_ENABLED]);
    await inner.save(config);

    await expect(repo.findByTenantId(TENANT_ID)).resolves.toBe(config);
    await expect(repo.findByTenantIds([TENANT_ID])).resolves.toEqual([config]);
    expect(cache.has(CACHE_KEY)).toBe(false);
  });
});
