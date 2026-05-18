import { CustomerBuilder } from '../../../../test/builders/customer';
import { InMemoryCustomerRepository } from '../../../../test/repositories/customer/in-memory-customer.repository';
import { GetCustomerTenantsUseCase } from './get-customer-tenants.use-case';

describe('GetCustomerTenantsUseCase', () => {
  let repo: InMemoryCustomerRepository;
  let useCase: GetCustomerTenantsUseCase;

  beforeEach(() => {
    repo = new InMemoryCustomerRepository();
    useCase = new GetCustomerTenantsUseCase(repo);
  });

  it('returns empty list when googleOAuthId has no customer records', async () => {
    const result = await useCase.execute('unknown-sub');

    expect(result).toEqual([]);
  });

  it('returns one entry for a googleOAuthId with a single tenant', async () => {
    const customer = new CustomerBuilder()
      .withTenantId('00000000-0000-0000-0000-000000000001')
      .withGoogleOAuthId('google-sub-single')
      .build();
    await repo.save(customer);

    const result = await useCase.execute('google-sub-single');

    expect(result).toHaveLength(1);
    expect(result[0].tenantId).toBe('00000000-0000-0000-0000-000000000001');
    expect(result[0].customerId).toBe(customer.id);
  });

  it('returns multiple entries when the same googleOAuthId exists in multiple tenants', async () => {
    const sub = 'google-sub-multi';
    const customerA = new CustomerBuilder()
      .withTenantId('00000000-0000-0000-0000-000000000001')
      .withGoogleOAuthId(sub)
      .build();
    const customerB = new CustomerBuilder()
      .withTenantId('00000000-0000-0000-0000-000000000002')
      .withGoogleOAuthId(sub)
      .build();
    await repo.save(customerA);
    await repo.save(customerB);

    const result = await useCase.execute(sub);

    expect(result).toHaveLength(2);
    const tenantIds = result.map((r) => r.tenantId);
    expect(tenantIds).toContain('00000000-0000-0000-0000-000000000001');
    expect(tenantIds).toContain('00000000-0000-0000-0000-000000000002');
  });

  it('does not leak records from other google accounts', async () => {
    const customerA = new CustomerBuilder()
      .withTenantId('00000000-0000-0000-0000-000000000001')
      .withGoogleOAuthId('sub-alice')
      .build();
    const customerB = new CustomerBuilder()
      .withTenantId('00000000-0000-0000-0000-000000000002')
      .withGoogleOAuthId('sub-bob')
      .build();
    await repo.save(customerA);
    await repo.save(customerB);

    const result = await useCase.execute('sub-alice');

    expect(result).toHaveLength(1);
    expect(result[0].tenantId).toBe('00000000-0000-0000-0000-000000000001');
  });
});
