import { TenantBuilder } from '../../../../test/builders/platform';
import { InMemoryTenantRepository } from '../../../../test/repositories/platform/in-memory-tenant.repository';
import { ListTenantsCreatedBeforeUseCase } from './list-tenants-created-before.use-case';

const at = (minutesAgo: number): Date => new Date(Date.now() - minutesAgo * 60_000);

describe('ListTenantsCreatedBeforeUseCase', () => {
  let repo: InMemoryTenantRepository;
  let useCase: ListTenantsCreatedBeforeUseCase;

  beforeEach(() => {
    repo = new InMemoryTenantRepository();
    useCase = new ListTenantsCreatedBeforeUseCase(repo);
  });

  it('returns only tenants created strictly before the cutoff, oldest first', async () => {
    const oldest = new TenantBuilder().withSlug('oldest').withCreatedAt(at(60)).build();
    const older = new TenantBuilder().withSlug('older').withCreatedAt(at(30)).build();
    const young = new TenantBuilder().withSlug('young').withCreatedAt(at(5)).build();
    await repo.save(young);
    await repo.save(older);
    await repo.save(oldest);

    const result = await useCase.execute({ cutoff: at(15), limit: 10 });

    expect(result.map((t) => t.slug)).toEqual(['oldest', 'older']);
  });

  it('returns exactly the six documented fields and includes inactive tenants', async () => {
    const tenant = new TenantBuilder()
      .withSlug('inactive-one')
      .withCreatedAt(at(60))
      .withIsActive(false)
      .build();
    await repo.save(tenant);

    const [row] = await useCase.execute({ cutoff: at(15), limit: 10 });

    expect(row).toEqual({
      tenantId: tenant.id,
      slug: 'inactive-one',
      countryCode: tenant.settings.localization.countryCode,
      timezone: tenant.settings.businessHours.timezone,
      createdAt: tenant.createdAt,
      isActive: false,
    });
  });

  it('pages by keyset: the next page starts after the last row of the previous one', async () => {
    const same = at(60);
    const a = new TenantBuilder()
      .withSlug('a-tenant')
      .withId('00000000-0000-7000-8000-00000000000a')
      .withCreatedAt(same)
      .build();
    const b = new TenantBuilder()
      .withSlug('b-tenant')
      .withId('00000000-0000-7000-8000-00000000000b')
      .withCreatedAt(same)
      .build();
    const c = new TenantBuilder().withSlug('c-tenant').withCreatedAt(at(30)).build();
    await repo.save(c);
    await repo.save(b);
    await repo.save(a);

    const first = await useCase.execute({ cutoff: at(15), limit: 2 });
    const last = first[first.length - 1];
    const second = await useCase.execute({
      cutoff: at(15),
      limit: 2,
      after: { createdAt: last.createdAt, id: last.tenantId },
    });

    expect(first.map((t) => t.slug)).toEqual(['a-tenant', 'b-tenant']);
    expect(second.map((t) => t.slug)).toEqual(['c-tenant']);
  });
});
