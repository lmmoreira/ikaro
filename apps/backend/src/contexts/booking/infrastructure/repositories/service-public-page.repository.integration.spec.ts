import { DataSource } from 'typeorm';
import { createTestDataSource } from '../../../../test/test-datasource';
import { ServiceBuilder } from '../../../../test/builders/booking/index';
import { InMemoryTenantSettingsPort } from '../../../../test/infrastructure/in-memory-tenant-settings.port';
import { uuidv7 } from '../../../../shared/domain/uuid-v7';
import { ServicePublicSlugTakenError } from '../../domain/errors/booking-domain.error';
import { ServicePublicProfile } from '../../domain/service-public-profile.vo';
import { ServiceEntity } from '../entities/service.entity';
import { TypeOrmServiceRepository } from './typeorm-service.repository';

// TD56-S03 — persistence of a service's public page: the partial unique index on
// (tenant_id, public_slug), lossless JSONB, and tenant-scoped lookup by slug.
describe('TypeOrmServiceRepository — public page (integration)', () => {
  const TENANT_A = uuidv7();
  const TENANT_B = uuidv7();
  let dataSource: DataSource;
  let repo: TypeOrmServiceRepository;

  beforeAll(async () => {
    dataSource = await createTestDataSource();
    repo = new TypeOrmServiceRepository(
      dataSource.getRepository(ServiceEntity),
      new InMemoryTenantSettingsPort(),
    );
  });

  afterAll(async () => {
    await dataSource
      .getRepository(ServiceEntity)
      .createQueryBuilder()
      .delete()
      .where('tenant_id IN (:...ids)', { ids: [TENANT_A, TENANT_B] })
      .execute();
    await dataSource.destroy();
  });

  it('round-trips the published flag, the slug and the whole profile losslessly', async () => {
    const profile = ServicePublicProfile.create({
      coverImageUrl: `tenants/${TENANT_A}/hotsite/service-profile/u1/cover.webp`,
      galleryImageUrls: ['g1.webp', 'g2.webp'],
      longDescription: 'Primeira linha.\n\n- item **forte**',
      inclusions: ['Chá', 'Toalhas'],
      preparationNotes: 'Chegue cedo.',
    });
    const service = new ServiceBuilder()
      .withTenantId(TENANT_A)
      .withPublicSlug('massagem-relaxante')
      .withPublicPagePublished(true)
      .withPublicProfile(profile)
      .build();
    await repo.save(service);

    const found = await repo.findById(service.id, TENANT_A);

    expect(found?.publicPagePublished).toBe(true);
    expect(found?.publicSlug?.value).toBe('massagem-relaxante');
    expect(found?.publicProfile?.toJSON()).toEqual(profile.toJSON());
  });

  it('stores an unpublished service without slug or profile by default', async () => {
    const service = new ServiceBuilder().withTenantId(TENANT_A).build();
    await repo.save(service);

    const found = await repo.findById(service.id, TENANT_A);

    expect(found?.publicPagePublished).toBe(false);
    expect(found?.publicSlug).toBeNull();
    expect(found?.publicProfile).toBeNull();
  });

  it('lets many services of a tenant have no slug at the same time (the unique index is partial)', async () => {
    const first = new ServiceBuilder().withTenantId(TENANT_B).build();
    const second = new ServiceBuilder().withTenantId(TENANT_B).build();

    await expect(repo.save(first)).resolves.toBeUndefined();
    await expect(repo.save(second)).resolves.toBeUndefined();
  });

  it('rejects a second service of the same tenant with the same slug as a ServicePublicSlugTakenError', async () => {
    const tenant = uuidv7();
    const first = new ServiceBuilder().withTenantId(tenant).withPublicSlug('duplicado').build();
    const second = new ServiceBuilder().withTenantId(tenant).withPublicSlug('duplicado').build();
    await repo.save(first);

    await expect(repo.save(second)).rejects.toBeInstanceOf(ServicePublicSlugTakenError);

    await dataSource.getRepository(ServiceEntity).delete({ tenantId: tenant });
  });

  it('accepts the same slug in two different tenants', async () => {
    const mine = new ServiceBuilder()
      .withTenantId(TENANT_A)
      .withPublicSlug('compartilhado')
      .build();
    const theirs = new ServiceBuilder()
      .withTenantId(TENANT_B)
      .withPublicSlug('compartilhado')
      .build();

    await repo.save(mine);
    await expect(repo.save(theirs)).resolves.toBeUndefined();
  });

  describe('findByPublicSlug()', () => {
    it('finds the service by slug inside the tenant', async () => {
      const service = new ServiceBuilder().withTenantId(TENANT_A).withPublicSlug('achado').build();
      await repo.save(service);

      expect((await repo.findByPublicSlug('achado', TENANT_A))?.id).toBe(service.id);
    });

    it("never returns another tenant's service for the same slug (tenant isolation)", async () => {
      const theirs = new ServiceBuilder().withTenantId(TENANT_B).withPublicSlug('so-do-b').build();
      await repo.save(theirs);

      expect(await repo.findByPublicSlug('so-do-b', TENANT_A)).toBeNull();
    });

    it('returns null for an unknown slug', async () => {
      expect(await repo.findByPublicSlug('nao-existe', TENANT_A)).toBeNull();
    });
  });
});
