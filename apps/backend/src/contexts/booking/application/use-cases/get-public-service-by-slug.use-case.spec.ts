import { ServiceBuilder } from '../../../../test/builders/booking/index';
import { InMemoryStorageService } from '../../../../test/infrastructure/in-memory-storage.service';
import { InMemoryServiceRepository } from '../../../../test/repositories/booking/in-memory-service.repository';
import { ServiceNotFoundError } from '../../domain/errors/booking-domain.error';
import { ServicePublicProfile } from '../../domain/service-public-profile.vo';
import { GetPublicServiceBySlugUseCase } from './get-public-service-by-slug.use-case';

const TENANT_A = '10000000-0000-4000-8000-000000000001';
const TENANT_B = '10000000-0000-4000-8000-000000000002';

describe('GetPublicServiceBySlugUseCase', () => {
  let serviceRepo: InMemoryServiceRepository;
  let storage: InMemoryStorageService;
  let useCase: GetPublicServiceBySlugUseCase;

  beforeEach(() => {
    serviceRepo = new InMemoryServiceRepository();
    storage = new InMemoryStorageService();
    useCase = new GetPublicServiceBySlugUseCase(serviceRepo, storage);
  });

  function published(overrides: { tenantId?: string } = {}) {
    return new ServiceBuilder()
      .withTenantId(overrides.tenantId ?? TENANT_A)
      .withName('Massagem')
      .withPublicSlug('massagem')
      .withPublicPagePublished(true);
  }

  it('returns the profile-facing fields of a published, active service', async () => {
    const service = published()
      .withPublicProfile(
        ServicePublicProfile.create({ longDescription: 'Texto', inclusions: ['Chá'] }),
      )
      .build();
    await serviceRepo.save(service);

    const result = await useCase.execute({
      tenantId: TENANT_A,
      publicSlug: 'massagem',
      locale: 'pt-BR',
    });

    expect(result).toMatchObject({
      id: service.id,
      name: 'Massagem',
      publicSlug: 'massagem',
      durationPolicy: 'FIXED',
      profile: { longDescription: 'Texto', inclusions: ['Chá'] },
    });
    expect(result.price.formatted).toBe('R$ 100,00');
  });

  it('returns the stored image paths as full public URLs', async () => {
    const cover = `tenants/${TENANT_A}/hotsite/service-profile/u1/cover.webp`;
    const gallery = `tenants/${TENANT_A}/hotsite/service-profile/u2/a.webp`;
    await serviceRepo.save(
      published()
        .withPublicProfile(
          ServicePublicProfile.create({ coverImageUrl: cover, galleryImageUrls: [gallery] }),
        )
        .build(),
    );

    const result = await useCase.execute({
      tenantId: TENANT_A,
      publicSlug: 'massagem',
      locale: 'pt-BR',
    });

    expect(result.profile.coverImageUrl).toBe(storage.getPublicUrl(cover));
    expect(result.profile.galleryImageUrls).toEqual([storage.getPublicUrl(gallery)]);
  });

  it('returns an empty profile (not an error) for a published page with no content yet', async () => {
    await serviceRepo.save(published().build());

    const result = await useCase.execute({
      tenantId: TENANT_A,
      publicSlug: 'massagem',
      locale: 'pt-BR',
    });

    expect(result.profile).toEqual({
      coverImageUrl: null,
      galleryImageUrls: [],
      longDescription: null,
      inclusions: [],
      preparationNotes: null,
    });
  });

  it('exposes the customer-chosen duration policy so the page shows no fixed price', async () => {
    await serviceRepo.save(
      published()
        .withBookingPolicy({
          durationPolicy: 'CUSTOMER_SELECTED',
          durationMinMinutes: 30,
          durationMaxMinutes: 120,
          durationIncrementMinutes: 30,
          pricingPolicy: 'PER_TIME_INCREMENT',
          pricingIncrementMinutes: 30,
          pricePerIncrementAmount: 40,
        })
        .build(),
    );

    const result = await useCase.execute({
      tenantId: TENANT_A,
      publicSlug: 'massagem',
      locale: 'pt-BR',
    });

    expect(result.durationPolicy).toBe('CUSTOMER_SELECTED');
  });

  it('never returns booking configuration', async () => {
    await serviceRepo.save(published().build());

    const result = await useCase.execute({
      tenantId: TENANT_A,
      publicSlug: 'massagem',
      locale: 'pt-BR',
    });

    expect(Object.keys(result).sort()).toEqual([
      'description',
      'durationMinutes',
      'durationPolicy',
      'id',
      'loyaltyPointsValue',
      'name',
      'price',
      'profile',
      'publicSlug',
    ]);
  });

  it.each([
    ['an unpublished page', (b: ServiceBuilder) => b.withPublicPagePublished(false)],
    ['an inactive service', (b: ServiceBuilder) => b.withIsActive(false)],
  ])('answers not-found for %s — the same answer as an unknown slug', async (_label, tweak) => {
    await serviceRepo.save(tweak(published()).build());

    await expect(
      useCase.execute({ tenantId: TENANT_A, publicSlug: 'massagem', locale: 'pt-BR' }),
    ).rejects.toBeInstanceOf(ServiceNotFoundError);
  });

  it('answers not-found for an unknown slug', async () => {
    await expect(
      useCase.execute({ tenantId: TENANT_A, publicSlug: 'nao-existe', locale: 'pt-BR' }),
    ).rejects.toBeInstanceOf(ServiceNotFoundError);
  });

  it("never serves another tenant's page for the same slug (tenant isolation)", async () => {
    await serviceRepo.save(published({ tenantId: TENANT_B }).build());

    await expect(
      useCase.execute({ tenantId: TENANT_A, publicSlug: 'massagem', locale: 'pt-BR' }),
    ).rejects.toBeInstanceOf(ServiceNotFoundError);
  });
});
