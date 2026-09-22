import { DataSource } from 'typeorm';
import { HotsiteConfigEntity } from '../entities/hotsite-config.entity';
import { LeadFormConfigEntity } from '../entities/lead-form-config.entity';
import { TenantEntity } from '../entities/tenant.entity';
import { TypeOrmHotsiteConfigRepository } from './typeorm-hotsite-config.repository';
import { TypeOrmLeadFormConfigRepository } from './typeorm-lead-form-config.repository';
import { TypeOrmTenantRepository } from './typeorm-tenant.repository';
import { CachingTenantRepository } from './caching-tenant.repository';
import { createTestDataSource } from '../../../../test/test-datasource';
import { runInNewTransaction } from '../../../../shared/infrastructure/run-in-new-transaction';
import { InMemoryCachePort } from '../../../../test/infrastructure/in-memory-cache.port';
import { InMemoryEventBus } from '../../../../test/infrastructure/in-memory-event-bus';
import {
  TenantBuilder,
  HotsiteConfigBuilder,
  LeadFormConfigBuilder,
} from '../../../../test/builders/platform';
import { DEFAULT_HOTSITE_BRANDING } from '../../domain/hotsite-config.aggregate';
import {
  HotsiteConfigConcurrentModificationError,
  LeadFormConfigConcurrentModificationError,
} from '../../domain/errors/platform-domain.error';
import { Tenant } from '../../domain/tenant.aggregate';

describe('Platform repositories (integration)', () => {
  let dataSource: DataSource;
  let tenantRepo: CachingTenantRepository;
  let typeOrmTenantRepo: TypeOrmTenantRepository;
  let hotsiteRepo: TypeOrmHotsiteConfigRepository;
  let leadFormConfigRepo: TypeOrmLeadFormConfigRepository;
  let cache: InMemoryCachePort;

  beforeAll(async () => {
    dataSource = await createTestDataSource();
    cache = new InMemoryCachePort();
    typeOrmTenantRepo = new TypeOrmTenantRepository(
      dataSource.getRepository(TenantEntity),
      new InMemoryEventBus(),
    );
    tenantRepo = new CachingTenantRepository(typeOrmTenantRepo, cache);
    hotsiteRepo = new TypeOrmHotsiteConfigRepository(dataSource.getRepository(HotsiteConfigEntity));
    leadFormConfigRepo = new TypeOrmLeadFormConfigRepository(
      dataSource.getRepository(LeadFormConfigEntity),
    );
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
    expect(cache.delCalls).toContain(`platform:tenant:${tenant.id}`);

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
    await cache.set(`platform:tenant:${cachedTenant.id}`, {
      id: cachedTenant.id,
      name: cachedTenant.name,
      slug: cachedTenant.slug.value,
      settings: cachedTenant.settings.toJSON(),
      isActive: cachedTenant.isActive,
      createdAt: cachedTenant.createdAt,
      updatedAt: cachedTenant.updatedAt,
    });
    const setCallsBefore = cache.setCalls.length;

    const result = await tenantRepo.findById(cachedTenant.id);

    expect(result).toBeInstanceOf(Tenant);
    expect(result!.name).toBe(cachedTenant.name);
    expect(findByIdSpy).not.toHaveBeenCalled();
    expect(cache.setCalls).toHaveLength(setCallsBefore);
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
    expect(initial!.seo).toEqual({ title: null, description: null, ogImageUrl: '' });

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
        ogImageUrl: '',
      },
      { maxBookingAdvanceDays: 90 },
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
      ogImageUrl: '',
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

  it('findByIdForUpdate locks and returns the current row from within a real transaction', async () => {
    const tenant = new TenantBuilder()
      .withName('Lavacar For Update')
      .withSlug('lavacar-for-update')
      .build();
    await tenantRepo.save(tenant);

    const result = await runInNewTransaction(dataSource, () =>
      typeOrmTenantRepo.findByIdForUpdate(tenant.id),
    );

    expect(result).toBeInstanceOf(Tenant);
    expect(result!.id).toBe(tenant.id);
    expect(result!.settings.booking.maxBookingAdvanceDays).toBe(
      tenant.settings.booking.maxBookingAdvanceDays,
    );
  });

  it('findByIdForUpdate throws when called outside an active transaction', async () => {
    await expect(typeOrmTenantRepo.findByIdForUpdate('any-id')).rejects.toThrow(
      'findByIdForUpdate must be called inside an active transaction',
    );
  });

  // M18-S03 follow-up (Codex review, PR #291): hotsite_configs had no version guard at all —
  // two concurrent PATCHes would silently last-write-wins, including deleting a superseded
  // image that a concurrent request had just started referencing. Mirrors
  // booking.repository.integration.spec.ts's "throws ...ConcurrentModificationError" test.
  it('throws HotsiteConfigConcurrentModificationError when saving a stale loaded config', async () => {
    const tenant = new TenantBuilder()
      .withName('Lavacar Concorrente')
      .withSlug('lavacar-concorrente')
      .build();
    await tenantRepo.save(tenant);

    const config = new HotsiteConfigBuilder().withTenantId(tenant.id).build();
    await hotsiteRepo.save(config);

    const copyA = await hotsiteRepo.findByTenantId(tenant.id);
    const copyB = await hotsiteRepo.findByTenantId(tenant.id);
    expect(copyA).not.toBeNull();
    expect(copyB).not.toBeNull();

    copyA!.updateContent(
      { ...DEFAULT_HOTSITE_BRANDING, primaryColor: '#111111' },
      [],
      { title: null, description: null, ogImageUrl: '' },
      { maxBookingAdvanceDays: 90 },
    );
    copyB!.updateContent(
      { ...DEFAULT_HOTSITE_BRANDING, primaryColor: '#222222' },
      [],
      { title: null, description: null, ogImageUrl: '' },
      { maxBookingAdvanceDays: 90 },
    );

    await hotsiteRepo.save(copyA!);

    await expect(hotsiteRepo.save(copyB!)).rejects.toBeInstanceOf(
      HotsiteConfigConcurrentModificationError,
    );

    // The winning write (A) is the one actually persisted — B's stale write never landed.
    const current = await hotsiteRepo.findByTenantId(tenant.id);
    expect(current!.branding.primaryColor).toBe('#111111');
  });

  // Mirrors the HotsiteConfig test above — lead_form_configs had no version guard at all, so
  // two concurrent PATCHes carrying audienceMode/questions would silently last-write-wins
  // (Codex review, M20-S08 PR #429, 2026-08-26).
  it('throws LeadFormConfigConcurrentModificationError when saving a stale loaded config', async () => {
    const tenant = new TenantBuilder()
      .withName('Lavacar Lead Form Concorrente')
      .withSlug('lavacar-lead-form-concorrente')
      .build();
    await tenantRepo.save(tenant);

    const config = new LeadFormConfigBuilder().withTenantId(tenant.id).build();
    await leadFormConfigRepo.save(config);

    const copyA = await leadFormConfigRepo.findByTenantId(tenant.id);
    const copyB = await leadFormConfigRepo.findByTenantId(tenant.id);
    expect(copyA).not.toBeNull();
    expect(copyB).not.toBeNull();

    copyA!.updateAudienceMode('CUSTOMER_ONLY');
    copyB!.updateAudienceMode('GUEST_AND_CUSTOMER');

    await leadFormConfigRepo.save(copyA!);

    await expect(leadFormConfigRepo.save(copyB!)).rejects.toBeInstanceOf(
      LeadFormConfigConcurrentModificationError,
    );

    // The winning write (A) is the one actually persisted — B's stale write never landed.
    const current = await leadFormConfigRepo.findByTenantId(tenant.id);
    expect(current!.audienceMode).toBe('CUSTOMER_ONLY');
  });
});
