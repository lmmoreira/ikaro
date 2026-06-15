import { InMemoryTransactionManager } from '../../../../test/infrastructure/in-memory-transaction-manager';
import { InMemoryStorageService } from '../../../../test/infrastructure/in-memory-storage.service';
import { TenantContextBuilder } from '../../../../test/factories/tenant-context.factory';
import { HotsiteConfigBuilder } from '../../../../test/builders/platform';
import { InMemoryHotsiteConfigRepository } from '../../../../test/repositories/platform/in-memory-hotsite-config.repository';
import {
  HotsiteImageNotUploadedError,
  HotsiteNotFoundError,
  PlatformDomainError,
} from '../../domain/errors/platform-domain.error';
import { DEFAULT_HOTSITE_BRANDING } from '../../domain/hotsite-config.aggregate';
import { HotsiteImagePathsService } from '../../domain/services/hotsite-image-paths.service';
import { UpdateHotsiteContentUseCase } from './update-hotsite-content.use-case';

const TENANT_A = '10000000-0000-4000-8000-000000000001';
const TENANT_B = '10000000-0000-4000-8000-000000000002';

describe('UpdateHotsiteContentUseCase', () => {
  let repo: InMemoryHotsiteConfigRepository;
  let storageService: InMemoryStorageService;
  let useCase: UpdateHotsiteContentUseCase;

  beforeEach(() => {
    repo = new InMemoryHotsiteConfigRepository();
    storageService = new InMemoryStorageService();
    useCase = new UpdateHotsiteContentUseCase(
      repo,
      storageService,
      new InMemoryTransactionManager(),
      new TenantContextBuilder().withTenantId(TENANT_A).build(),
      new HotsiteImagePathsService(),
    );
  });

  it('throws HotsiteNotFoundError when no config exists for the tenant', async () => {
    await expect(useCase.execute({ branding: { primaryColor: '#FF5733' } })).rejects.toBeInstanceOf(
      HotsiteNotFoundError,
    );
  });

  it('merges partial branding into the existing branding without wiping other fields', async () => {
    const config = new HotsiteConfigBuilder().withTenantId(TENANT_A).buildWithContent();
    await repo.save(config);

    const result = await useCase.execute({ branding: { primaryColor: '#FF5733' } });

    expect(result.branding.primaryColor).toBe('#FF5733');
    expect(result.branding.secondaryColor).toBe(DEFAULT_HOTSITE_BRANDING.secondaryColor);
    expect(result.layout).toEqual(config.layout);
  });

  it('replaces the layout when provided', async () => {
    const config = new HotsiteConfigBuilder().withTenantId(TENANT_A).buildWithContent();
    await repo.save(config);

    const newLayout = [
      {
        type: 'SERVICE_LIST' as const,
        enabled: true,
        data: { showPrices: true, showPoints: true, layout: 'grid' },
      },
    ];

    const result = await useCase.execute({ layout: newLayout });

    expect(result.layout).toEqual(newLayout);
    expect(result.branding).toEqual(config.branding);
  });

  it('persists the merged content to the repository', async () => {
    const config = new HotsiteConfigBuilder().withTenantId(TENANT_A).buildWithContent();
    await repo.save(config);

    await useCase.execute({ branding: { primaryColor: '#123456' } });

    const saved = await repo.findByTenantId(TENANT_A);
    expect(saved!.branding.primaryColor).toBe('#123456');
  });

  it('throws PlatformDomainError when branding has an invalid hex color', async () => {
    const config = new HotsiteConfigBuilder().withTenantId(TENANT_A).buildWithContent();
    await repo.save(config);

    await expect(
      useCase.execute({ branding: { primaryColor: 'not-a-color' } }),
    ).rejects.toBeInstanceOf(PlatformDomainError);
  });

  it('throws PlatformDomainError when the layout has an unknown module type', async () => {
    const config = new HotsiteConfigBuilder().withTenantId(TENANT_A).buildWithContent();
    await repo.save(config);

    const layout = [{ type: 'UNKNOWN' as unknown as 'HERO', enabled: true, data: {} }];

    await expect(useCase.execute({ layout })).rejects.toBeInstanceOf(PlatformDomainError);
  });

  it('verifies the branding logoUrl exists in storage before persisting', async () => {
    const config = new HotsiteConfigBuilder().withTenantId(TENANT_A).buildWithContent();
    await repo.save(config);
    const logoPath = `tenants/${TENANT_A}/hotsite/branding/u1/logo.png`;

    await expect(useCase.execute({ branding: { logoUrl: logoPath } })).rejects.toBeInstanceOf(
      HotsiteImageNotUploadedError,
    );

    storageService.markAsUploaded(logoPath);
    const result = await useCase.execute({ branding: { logoUrl: logoPath } });
    expect(result.branding.logoUrl).toBe(logoPath);
  });

  it('verifies HERO backgroundImageUrl exists in storage before persisting', async () => {
    const config = new HotsiteConfigBuilder().withTenantId(TENANT_A).buildWithContent();
    await repo.save(config);
    const imagePath = `tenants/${TENANT_A}/hotsite/hero/u1/bg.jpg`;

    const layout = [
      {
        type: 'HERO' as const,
        enabled: true,
        data: {
          variant: 'centered',
          title: 'Cuidado completo para o seu carro',
          backgroundImageUrl: imagePath,
          ctaLabel: 'Agendar agora',
          ctaTarget: 'booking-form',
        },
      },
    ];

    await expect(useCase.execute({ layout })).rejects.toBeInstanceOf(HotsiteImageNotUploadedError);

    storageService.markAsUploaded(imagePath);
    const result = await useCase.execute({ layout });
    const data = result.layout[0]!.data as unknown as Record<string, unknown>;
    expect(data['backgroundImageUrl']).toBe(imagePath);
  });

  it('verifies each TESTIMONIALS item avatarUrl exists in storage', async () => {
    const config = new HotsiteConfigBuilder().withTenantId(TENANT_A).buildWithContent();
    await repo.save(config);
    const avatarPath = `tenants/${TENANT_A}/hotsite/gallery/u1/avatar.jpg`;

    const layout = [
      {
        type: 'TESTIMONIALS' as const,
        enabled: true,
        data: {
          items: [{ authorName: 'Maria', text: 'Ótimo serviço!', avatarUrl: avatarPath }],
          layout: 'grid',
        },
      },
    ];

    await expect(useCase.execute({ layout })).rejects.toBeInstanceOf(HotsiteImageNotUploadedError);

    storageService.markAsUploaded(avatarPath);
    await expect(useCase.execute({ layout })).resolves.toBeDefined();
  });

  it('verifies every GALLERY image exists in storage uniformly — upload and booking sources alike', async () => {
    const config = new HotsiteConfigBuilder().withTenantId(TENANT_A).buildWithContent();
    await repo.save(config);
    const uploadedPath = `tenants/${TENANT_A}/hotsite/gallery/u1/photo.jpg`;
    const featuredPath = `tenants/${TENANT_A}/hotsite/gallery/u2/featured.jpg`;

    const layout = [
      {
        type: 'GALLERY' as const,
        enabled: true,
        data: {
          images: [
            { url: uploadedPath, source: 'upload' },
            { url: featuredPath, source: 'booking', bookingId: 'b1', photoType: 'after' },
          ],
          layout: 'grid',
          maxVisible: 6,
        },
      },
    ];

    await expect(useCase.execute({ layout })).rejects.toBeInstanceOf(HotsiteImageNotUploadedError);

    storageService.markAsUploaded(uploadedPath);
    await expect(useCase.execute({ layout })).rejects.toBeInstanceOf(HotsiteImageNotUploadedError);

    storageService.markAsUploaded(featuredPath);
    await expect(useCase.execute({ layout })).resolves.toBeDefined();
  });

  it('tenant isolation: updating tenant A does not affect tenant B', async () => {
    const configA = new HotsiteConfigBuilder().withTenantId(TENANT_A).buildWithContent();
    const configB = new HotsiteConfigBuilder().withTenantId(TENANT_B).buildWithContent();
    await repo.save(configA);
    await repo.save(configB);

    await useCase.execute({ branding: { primaryColor: '#000000' } });

    const savedB = await repo.findByTenantId(TENANT_B);
    expect(savedB!.branding.primaryColor).toBe(DEFAULT_HOTSITE_BRANDING.primaryColor);
  });

  it('tenant isolation: rejects a logoUrl pointing at another tenant storage path even if it exists', async () => {
    const config = new HotsiteConfigBuilder().withTenantId(TENANT_A).buildWithContent();
    await repo.save(config);
    const otherTenantPath = `tenants/${TENANT_B}/hotsite/branding/u1/logo.png`;
    storageService.markAsUploaded(otherTenantPath);

    await expect(
      useCase.execute({ branding: { logoUrl: otherTenantPath } }),
    ).rejects.toBeInstanceOf(HotsiteImageNotUploadedError);
  });

  it('sets seo title and description from null defaults', async () => {
    const config = new HotsiteConfigBuilder().withTenantId(TENANT_A).buildWithContent();
    await repo.save(config);

    const result = await useCase.execute({
      seo: { title: 'Lavacar Estrela — Agendamento Online', description: 'Agende sua lavagem.' },
    });

    expect(result.seo).toEqual({
      title: 'Lavacar Estrela — Agendamento Online',
      description: 'Agende sua lavagem.',
    });
  });

  it('merges a partial seo update without wiping the other field', async () => {
    const config = new HotsiteConfigBuilder()
      .withTenantId(TENANT_A)
      .withSeo({ title: 'Título Original', description: 'Descrição original' })
      .buildWithContent();
    await repo.save(config);

    const result = await useCase.execute({ seo: { title: 'Novo título' } });

    expect(result.seo.title).toBe('Novo título');
    expect(result.seo.description).toBe('Descrição original');
  });

  it('throws PlatformDomainError when seo.title exceeds 70 characters', async () => {
    const config = new HotsiteConfigBuilder().withTenantId(TENANT_A).buildWithContent();
    await repo.save(config);

    await expect(useCase.execute({ seo: { title: 'a'.repeat(71) } })).rejects.toBeInstanceOf(
      PlatformDomainError,
    );
  });

  it('throws PlatformDomainError when seo.description exceeds 160 characters', async () => {
    const config = new HotsiteConfigBuilder().withTenantId(TENANT_A).buildWithContent();
    await repo.save(config);

    await expect(useCase.execute({ seo: { description: 'a'.repeat(161) } })).rejects.toBeInstanceOf(
      PlatformDomainError,
    );
  });
});
