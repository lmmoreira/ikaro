import { HttpException, HttpStatus } from '@nestjs/common';
import { TenantBuilder } from '../../../../test/builders/platform';
import { InMemoryTenantRepository } from '../../../../test/repositories/platform/in-memory-tenant.repository';
import { GetTenantByIdUseCase } from '../../application/use-cases/get-tenant-by-id.use-case';
import { GetTenantBySlugUseCase } from '../../application/use-cases/get-tenant-by-slug.use-case';
import { InternalTenantReadController } from './internal-tenant-read.controller';

describe('InternalTenantReadController', () => {
  let repo: InMemoryTenantRepository;
  let controller: InternalTenantReadController;

  beforeEach(() => {
    repo = new InMemoryTenantRepository();
    controller = new InternalTenantReadController(
      new GetTenantByIdUseCase(repo),
      new GetTenantBySlugUseCase(repo),
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
});
