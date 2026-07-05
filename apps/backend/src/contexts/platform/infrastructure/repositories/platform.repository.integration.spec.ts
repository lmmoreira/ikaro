import { DataSource } from 'typeorm';
import type { Cache } from 'cache-manager';
import { HotsiteConfigEntity } from '../entities/hotsite-config.entity';
import { TenantEntity } from '../entities/tenant.entity';
import { TypeOrmHotsiteConfigRepository } from './typeorm-hotsite-config.repository';
import { TypeOrmTenantRepository } from './typeorm-tenant.repository';
import { CachingTenantRepository } from './caching-tenant.repository';
import { createTestDataSource } from '../../../../test/test-datasource';
import { TenantBuilder, HotsiteConfigBuilder } from '../../../../test/builders/platform';
import { DEFAULT_HOTSITE_BRANDING } from '../../domain/hotsite-config.aggregate';
import { Tenant } from '../../domain/tenant.aggregate';

describe('Platform repositories (integration)', () => {
  let dataSource: DataSource;
  let tenantRepo: CachingTenantRepository;
  let typeOrmTenantRepo: TypeOrmTenantRepository;
  let hotsiteRepo: TypeOrmHotsiteConfigRepository;
  let cacheManager: jest.Mocked<Pick<Cache, 'get' | 'set' | 'del'>>;

  beforeAll(async () => {
    dataSource = await createTestDataSource();
    cacheManager = {
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue(undefined),
      del: jest.fn().mockResolvedValue(undefined),
    };
    typeOrmTenantRepo = new TypeOrmTenantRepository(dataSource.getRepository(TenantEntity));
    tenantRepo = new CachingTenantRepository(typeOrmTenantRepo, cacheManager as unknown as Cache);
    hotsiteRepo = new TypeOrmHotsiteConfigRepository(dataSource.getRepository(HotsiteConfigEntity));
  });

  afterAll(async () => {
    await dataSource.destroy();
  });

  it('tenant provisioning and full lifecycle — create, find, update, deactivate', async () => {
    const tenant = new TenantBuilder()
      .withName('Lavacar Estrela')
      .withSlug('lavacar-estrela')
      .build();
    await tenantRepo.save(tenant);
    expect(cacheManager.del).toHaveBeenCalledWith(`platform:tenant:${tenant.id}`);

    // Full retrieval by slug verifies all fields survive the round-trip
    const bySlug = await tenantRepo.findBySlug('lavacar-estrela');
    expect(bySlug).not.toBeNull();
    expect(bySlug!.id).toBe(tenant.id);
    expect(bySlug!.name).toBe('Lavacar Estrela');
    expect(bySlug!.isActive).toBe(true);
    expect(bySlug!.settings.loyalty.expiryDays).toBe(180);
    expect(bySlug!.settings.businessHours.timezone).toBe('America/Sao_Paulo');

    // findById returns the same aggregate
    const byId = await tenantRepo.findById(tenant.id);
    expect(byId!.slug.value).toBe('lavacar-estrela');

    // existsBySlug reflects reality
    expect(await tenantRepo.existsBySlug('lavacar-estrela')).toBe(true);
    expect(await tenantRepo.existsBySlug('never-provisioned')).toBe(false);

    // Deactivation persists
    tenant.deactivate();
    await tenantRepo.save(tenant);
    const deactivated = await tenantRepo.findBySlug('lavacar-estrela');
    expect(deactivated!.isActive).toBe(false);
  });

  it('findById returns cached tenant data without hitting the TypeORM repository again', async () => {
    const cachedTenant = new TenantBuilder().withSlug('cached-estrela').build();
    const findByIdSpy = jest.spyOn(typeOrmTenantRepo, 'findById');
    cacheManager.set.mockClear();
    cacheManager.get.mockResolvedValueOnce({
      id: cachedTenant.id,
      name: cachedTenant.name,
      slug: cachedTenant.slug.value,
      settings: cachedTenant.settings.toJSON(),
      isActive: cachedTenant.isActive,
      createdAt: cachedTenant.createdAt,
      updatedAt: cachedTenant.updatedAt,
    });

    const result = await tenantRepo.findById(cachedTenant.id);

    expect(result).toBeInstanceOf(Tenant);
    expect(result!.name).toBe(cachedTenant.name);
    expect(findByIdSpy).not.toHaveBeenCalled();
    expect(cacheManager.set).not.toHaveBeenCalled();
  });

  it('hotsite config management — from empty slate to branded and published', async () => {
    const tenant = new TenantBuilder()
      .withName('Lavacar Brilho')
      .withSlug('lavacar-brilho')
      .build();
    await tenantRepo.save(tenant);

    // No config exists yet
    expect(await hotsiteRepo.findByTenantId(tenant.id)).toBeNull();

    // Create the initial (unpublished) config
    const config = new HotsiteConfigBuilder().withTenantId(tenant.id).build();
    await hotsiteRepo.save(config);

    const initial = await hotsiteRepo.findByTenantId(tenant.id);
    expect(initial!.id).toBe(config.id);
    expect(initial!.isPublished).toBe(false);
    expect(initial!.layout).toHaveLength(0);
    expect(initial!.seo).toEqual({ title: null, description: null });

    // Admin sets branding, layout modules, and seo title/description
    config.updateContent(
      {
        ...DEFAULT_HOTSITE_BRANDING,
        primaryColor: '#FF5733',
        logoUrl: 'https://cdn.example.com/logo.png',
      },
      [
        {
          type: 'HERO',
          enabled: true,
          data: {
            variant: 'centered',
            title: 'Bem-vindo',
            ctaLabel: 'Agendar',
            ctaTarget: 'booking-form',
          },
        },
        {
          type: 'SERVICE_LIST',
          enabled: true,
          data: { showPrices: true, showPoints: true, layout: 'grid' },
        },
        {
          type: 'BOOKING_CTA',
          enabled: true,
          data: { title: 'Agende já', ctaLabel: 'Agendar agora' },
        },
      ],
      {
        title: 'Lavacar Brilho — Agendamento Online',
        description: 'Agende sua lavagem rápido e fácil.',
      },
    );
    await hotsiteRepo.save(config);

    const branded = await hotsiteRepo.findByTenantId(tenant.id);
    expect(branded!.branding.primaryColor).toBe('#FF5733');
    expect(branded!.branding.logoUrl).toBe('https://cdn.example.com/logo.png');
    expect(branded!.layout).toHaveLength(3);
    expect(branded!.layout[0].type).toBe('HERO');
    expect(branded!.seo).toEqual({
      title: 'Lavacar Brilho — Agendamento Online',
      description: 'Agende sua lavagem rápido e fácil.',
    });
  });

  it('multi-tenant isolation — Tenant B cannot access Tenant A hotsite config', async () => {
    const tenantA = new TenantBuilder().withName('Lavacar Alpha').withSlug('lavacar-alpha').build();
    const tenantB = new TenantBuilder().withName('Lavacar Beta').withSlug('lavacar-beta').build();
    await tenantRepo.save(tenantA);
    await tenantRepo.save(tenantB);

    // Only Tenant A has a hotsite config
    const configA = new HotsiteConfigBuilder().withTenantId(tenantA.id).build();
    await hotsiteRepo.save(configA);

    // Querying with Tenant B's ID returns nothing
    const resultForB = await hotsiteRepo.findByTenantId(tenantB.id);
    expect(resultForB).toBeNull();

    // Tenant A still sees its own config
    const resultForA = await hotsiteRepo.findByTenantId(tenantA.id);
    expect(resultForA!.id).toBe(configA.id);
  });
});
