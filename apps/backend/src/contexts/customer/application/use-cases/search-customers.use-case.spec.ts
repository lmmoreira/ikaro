import { CustomerBuilder } from '../../../../test/builders/customer/customer.builder';
import { InMemoryCustomerRepository } from '../../../../test/repositories/customer/in-memory-customer.repository';
import { SearchCustomersUseCase } from './search-customers.use-case';

const TENANT_A = '10000000-0000-4000-8000-000000000130';
const TENANT_B = '10000000-0000-4000-8000-000000000131';

describe('SearchCustomersUseCase', () => {
  let repo: InMemoryCustomerRepository;
  let useCase: SearchCustomersUseCase;

  beforeEach(() => {
    repo = new InMemoryCustomerRepository();
    useCase = new SearchCustomersUseCase(repo);
  });

  it('returns all customers in tenant when search is omitted', async () => {
    const c1 = new CustomerBuilder()
      .withTenantId(TENANT_A)
      .withName('Alice')
      .withEmail('alice@example.com')
      .build();
    const c2 = new CustomerBuilder()
      .withTenantId(TENANT_A)
      .withName('Bob')
      .withEmail('bob@example.com')
      .build();
    await repo.save(c1);
    await repo.save(c2);

    const result = await useCase.execute({ tenantId: TENANT_A, limit: 20 });

    expect(result.total).toBe(2);
    expect(result.items).toHaveLength(2);
  });

  it('filters by name via search term', async () => {
    const c1 = new CustomerBuilder()
      .withTenantId(TENANT_A)
      .withName('João Silva')
      .withEmail('joao@example.com')
      .build();
    const c2 = new CustomerBuilder()
      .withTenantId(TENANT_A)
      .withName('Maria')
      .withEmail('maria@example.com')
      .build();
    await repo.save(c1);
    await repo.save(c2);

    const result = await useCase.execute({ tenantId: TENANT_A, search: 'João', limit: 20 });

    expect(result.total).toBe(1);
    expect(result.items[0]?.name).toBe('João Silva');
  });

  it('filters by email via search term', async () => {
    const c1 = new CustomerBuilder()
      .withTenantId(TENANT_A)
      .withName('Alice')
      .withEmail('alice@acme.com')
      .build();
    const c2 = new CustomerBuilder()
      .withTenantId(TENANT_A)
      .withName('Bob')
      .withEmail('bob@other.com')
      .build();
    await repo.save(c1);
    await repo.save(c2);

    const result = await useCase.execute({ tenantId: TENANT_A, search: 'acme', limit: 20 });

    expect(result.total).toBe(1);
    expect(result.items[0]?.email).toBe('alice@acme.com');
  });

  it('tenant-isolation: does not return customers from another tenant', async () => {
    const cA = new CustomerBuilder()
      .withTenantId(TENANT_A)
      .withName('Alice')
      .withEmail('alice@a.com')
      .build();
    const cB = new CustomerBuilder()
      .withTenantId(TENANT_B)
      .withName('Bruno')
      .withEmail('bruno@b.com')
      .build();
    await repo.save(cA);
    await repo.save(cB);

    const result = await useCase.execute({ tenantId: TENANT_A, limit: 20 });

    expect(result.total).toBe(1);
    expect(result.items[0]?.name).toBe('Alice');
  });

  it('respects limit', async () => {
    for (let i = 0; i < 5; i++) {
      await repo.save(
        new CustomerBuilder()
          .withTenantId(TENANT_A)
          .withName(`Customer ${i}`)
          .withEmail(`c${i}@example.com`)
          .build(),
      );
    }

    const result = await useCase.execute({ tenantId: TENANT_A, limit: 3 });

    expect(result.items).toHaveLength(3);
    expect(result.total).toBe(5);
  });
});
