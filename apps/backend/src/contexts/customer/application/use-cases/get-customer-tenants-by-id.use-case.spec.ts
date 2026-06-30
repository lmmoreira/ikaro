import { CustomerBuilder } from '../../../../test/builders/customer';
import { InMemoryCustomerRepository } from '../../../../test/repositories/customer/in-memory-customer.repository';
import { CustomerNotFoundError } from '../../domain/errors/customer-domain.error';
import { GetCustomerTenantsByIdUseCase } from './get-customer-tenants-by-id.use-case';

describe('GetCustomerTenantsByIdUseCase', () => {
  let repo: InMemoryCustomerRepository;
  let useCase: GetCustomerTenantsByIdUseCase;

  beforeEach(() => {
    repo = new InMemoryCustomerRepository();
    useCase = new GetCustomerTenantsByIdUseCase(repo);
  });

  it('throws CustomerNotFoundError when customerId does not exist in the given tenant', async () => {
    await expect(
      useCase.execute({ customerId: 'non-existent-id', tenantId: '10000000-0000-4000-8000-000000000001' }),
    ).rejects.toThrow(CustomerNotFoundError);
  });

  it('throws CustomerNotFoundError when customerId exists but in a different tenant (isolation)', async () => {
    const customer = new CustomerBuilder()
      .withTenantId('10000000-0000-4000-8000-000000000001')
      .withGoogleOAuthId('google-sub-abc')
      .build();
    await repo.save(customer);

    await expect(
      useCase.execute({ customerId: customer.id, tenantId: '10000000-0000-4000-8000-000000000002' }),
    ).rejects.toThrow(CustomerNotFoundError);
  });

  it('returns all tenants for the customer identified by their customerId + tenantId', async () => {
    const sub = 'google-sub-multi';
    const tenantA = '10000000-0000-4000-8000-000000000001';
    const tenantB = '10000000-0000-4000-8000-000000000002';

    const customerA = new CustomerBuilder().withTenantId(tenantA).withGoogleOAuthId(sub).build();
    const customerB = new CustomerBuilder().withTenantId(tenantB).withGoogleOAuthId(sub).build();
    await repo.save(customerA);
    await repo.save(customerB);

    const result = await useCase.execute({ customerId: customerA.id, tenantId: tenantA });

    expect(result).toHaveLength(2);
    const tenantIds = result.map((r) => r.tenantId);
    expect(tenantIds).toContain(tenantA);
    expect(tenantIds).toContain(tenantB);
  });

  it('returns only the single tenant when customer belongs to one tenant', async () => {
    const tenantA = '10000000-0000-4000-8000-000000000001';
    const customer = new CustomerBuilder()
      .withTenantId(tenantA)
      .withGoogleOAuthId('google-sub-single')
      .build();
    await repo.save(customer);

    const result = await useCase.execute({ customerId: customer.id, tenantId: tenantA });

    expect(result).toHaveLength(1);
    expect(result[0].tenantId).toBe(tenantA);
    expect(result[0].customerId).toBe(customer.id);
  });
});
