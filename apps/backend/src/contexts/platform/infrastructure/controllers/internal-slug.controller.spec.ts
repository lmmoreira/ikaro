import { InMemoryTenantRepository } from '../../../../test/repositories/platform/in-memory-tenant.repository';
import { TenantBuilder } from '../../../../test/builders/platform/tenant.builder';
import { CheckSlugAvailabilityUseCase } from '../../application/use-cases/check-slug-availability.use-case';
import { SlugPolicy } from '../../domain/slug-policy';
import { InternalSlugController } from './internal-slug.controller';

// A real use case over the in-memory repository, not a double: the controller is a thin forwarder,
// so what matters is that the slug reaches the policy and the repository unchanged.
function build(): { controller: InternalSlugController; tenantRepo: InMemoryTenantRepository } {
  const tenantRepo = new InMemoryTenantRepository();
  const useCase = new CheckSlugAvailabilityUseCase(new SlugPolicy('ikaro'), tenantRepo);
  return { controller: new InternalSlugController(useCase), tenantRepo };
}

describe('InternalSlugController', () => {
  it('answers available for a free slug', async () => {
    const { controller } = build();

    await expect(controller.getSlugAvailability('lavacar-top')).resolves.toEqual({
      status: 'available',
    });
  });

  it('answers taken for a slug a tenant uses', async () => {
    const { controller, tenantRepo } = build();
    await tenantRepo.save(new TenantBuilder().withSlug('lavacar-top').build());

    await expect(controller.getSlugAvailability('lavacar-top')).resolves.toEqual({
      status: 'taken',
    });
  });

  it('treats a missing slug as empty, which the policy reports as too short', async () => {
    const { controller } = build();

    await expect(controller.getSlugAvailability(undefined)).resolves.toEqual({
      status: 'invalid',
      reason: 'TOO_SHORT',
    });
  });

  it('is mounted outside internal/tenants, where :tenantId would shadow it', () => {
    expect(Reflect.getMetadata('path', InternalSlugController)).toBe('internal/signup');
  });
});
