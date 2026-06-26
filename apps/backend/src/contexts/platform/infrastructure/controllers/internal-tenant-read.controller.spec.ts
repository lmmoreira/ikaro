import { HttpException, HttpStatus } from '@nestjs/common';
import { HotsiteConfigBuilder, TenantBuilder } from '../../../../test/builders/platform';
import { InMemoryHotsiteConfigRepository } from '../../../../test/repositories/platform/in-memory-hotsite-config.repository';
import { InMemoryTenantRepository } from '../../../../test/repositories/platform/in-memory-tenant.repository';
import { GetTenantByIdUseCase } from '../../application/use-cases/get-tenant-by-id.use-case';
import { GetTenantBySlugUseCase } from '../../application/use-cases/get-tenant-by-slug.use-case';
import { GetTenantsByIdsUseCase } from '../../application/use-cases/get-tenants-by-ids.use-case';
import { ListPublishedHotsitesUseCase } from '../../application/use-cases/list-published-hotsites.use-case';
import { InternalTenantReadController } from './internal-tenant-read.controller';

describe('InternalTenantReadController', () => {
  let repo: InMemoryTenantRepository;
  let hotsiteConfigRepo: InMemoryHotsiteConfigRepository;
  let controller: InternalTenantReadController;

  beforeEach(() => {
    repo = new InMemoryTenantRepository();
    hotsiteConfigRepo = new InMemoryHotsiteConfigRepository();
    controller = new InternalTenantReadController(
      new GetTenantByIdUseCase(repo),
      new GetTenantBySlugUseCase(repo),
      new GetTenantsByIdsUseCase(repo),
      new ListPublishedHotsitesUseCase(repo, hotsiteConfigRepo),
    );
  });

  describe('getTenant() — by ID', () => {
    it('maps TenantNotFoundError to 404 when tenant does not exist', async () => {
      const err = await controller.getTenant('unknown-id').catch((e: unknown) => e);

      expect(err).toBeInstanceOf(HttpException);
      expect((err as HttpException).getStatus()).toBe(HttpStatus.NOT_FOUND);
    });

    it('returns id, slug, and name for a known tenant', async () => {
      const tenant = new TenantBuilder().withSlug('lavacar-bh').withName('Lavacar BH').build();
      await repo.save(tenant);

      const result = await controller.getTenant(tenant.id);

      expect(result.id).toBe(tenant.id);
      expect(result.slug).toBe('lavacar-bh');
      expect(result.name).toBe('Lavacar BH');
    });
  });

  describe('getTenantBySlugRoute() — by slug', () => {
    it('maps TenantNotFoundError to 404 when slug does not exist', async () => {
      const err = await controller.getTenantBySlugRoute('no-such-slug').catch((e: unknown) => e);

      expect(err).toBeInstanceOf(HttpException);
      expect((err as HttpException).getStatus()).toBe(HttpStatus.NOT_FOUND);
    });

    it('returns tenant info for a known slug', async () => {
      const tenant = new TenantBuilder().withSlug('lavacar-sp').withName('Lavacar SP').build();
      await repo.save(tenant);

      const result = await controller.getTenantBySlugRoute('lavacar-sp');

      expect(result.id).toBe(tenant.id);
      expect(result.slug).toBe('lavacar-sp');
    });
  });

  describe('getTenantsByIdsRoute() — batch by IDs', () => {
    it('returns 400 when ids query param is absent', async () => {
      const err = await controller.getTenantsByIdsRoute(undefined).catch((e: unknown) => e);

      expect(err).toBeInstanceOf(HttpException);
      expect((err as HttpException).getStatus()).toBe(HttpStatus.BAD_REQUEST);
    });

    it('returns 400 when ids query param is empty', async () => {
      const err = await controller.getTenantsByIdsRoute('').catch((e: unknown) => e);

      expect(err).toBeInstanceOf(HttpException);
      expect((err as HttpException).getStatus()).toBe(HttpStatus.BAD_REQUEST);
    });

    it('returns 400 when ids contains only separators or whitespace', async () => {
      const err = await controller.getTenantsByIdsRoute(',,,').catch((e: unknown) => e);

      expect(err).toBeInstanceOf(HttpException);
      expect((err as HttpException).getStatus()).toBe(HttpStatus.BAD_REQUEST);
    });

    it('returns id, slug, and name for each found tenant', async () => {
      const a = new TenantBuilder().withSlug('lavacar-bh').withName('Lavacar BH').build();
      const b = new TenantBuilder().withSlug('autospa-sp').withName('AutoSpa SP').build();
      await repo.save(a);
      await repo.save(b);

      const result = await controller.getTenantsByIdsRoute(`${a.id},${b.id}`);

      expect(result).toEqual(
        expect.arrayContaining([
          { id: a.id, slug: 'lavacar-bh', name: 'Lavacar BH', locale: 'pt-BR' },
          { id: b.id, slug: 'autospa-sp', name: 'AutoSpa SP', locale: 'pt-BR' },
        ]),
      );
      expect(result).toHaveLength(2);
    });

    it('returns an empty array when none of the IDs exist', async () => {
      const result = await controller.getTenantsByIdsRoute('non-existent-1,non-existent-2');

      expect(result).toEqual([]);
    });
  });

  describe('getPublishedHotsites()', () => {
    it('returns only active tenants with a published hotsite', async () => {
      const tenant = new TenantBuilder().withSlug('lavacar-publicado').build();
      await repo.save(tenant);
      const config = new HotsiteConfigBuilder().withTenantId(tenant.id).buildPublished();
      await hotsiteConfigRepo.save(config);

      const result = await controller.getPublishedHotsites();

      expect(result.items).toEqual([
        { slug: 'lavacar-publicado', updatedAt: config.updatedAt.toISOString() },
      ]);
    });

    it('returns an empty list when no hotsite is published', async () => {
      const result = await controller.getPublishedHotsites();

      expect(result.items).toEqual([]);
    });
  });
});
