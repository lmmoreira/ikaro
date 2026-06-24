import { CustomerBuilder } from '../../../../test/builders/customer/customer.builder';
import { InMemoryCustomerRepository } from '../../../../test/repositories/customer/in-memory-customer.repository';
import { RequestContextBuilder } from '../../../../test/factories/request-context.factory';
import { ICustomerLoyaltyPort } from '../ports/customer-loyalty.port';
import { SearchCustomersUseCase } from './search-customers.use-case';

const TENANT_A = '10000000-0000-4000-8000-000000000130';
const TENANT_B = '10000000-0000-4000-8000-000000000131';

function makeLoyaltyPort(points: Record<string, number> = {}): ICustomerLoyaltyPort {
  return {
    getCurrentPoints: async (_tenantId, customerId) => points[customerId] ?? 0,
  };
}

describe('SearchCustomersUseCase', () => {
  let repo: InMemoryCustomerRepository;

  beforeEach(() => {
    repo = new InMemoryCustomerRepository();
  });

  async function makeUseCase(tenantId: string, loyaltyPoints?: Record<string, number>) {
    const ctx = new RequestContextBuilder().withTenantId(tenantId).withActorType('STAFF').build();
    return new SearchCustomersUseCase(repo, makeLoyaltyPort(loyaltyPoints), ctx);
  }

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

    const useCase = await makeUseCase(TENANT_A, { [c1.id]: 50, [c2.id]: 10 });
    const result = await useCase.execute({ limit: 20 });

    expect(result.total).toBe(2);
    expect(result.items).toHaveLength(2);
    const alice = result.items.find((i) => i.name === 'Alice');
    expect(alice?.currentPoints).toBe(50);
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

    const useCase = await makeUseCase(TENANT_A);
    const result = await useCase.execute({ search: 'João', limit: 20 });

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

    const useCase = await makeUseCase(TENANT_A);
    const result = await useCase.execute({ search: 'acme', limit: 20 });

    expect(result.total).toBe(1);
    expect(result.items[0]?.email).toBe('alice@acme.com');
  });

  it('returns currentPoints = 0 when customer has no balance', async () => {
    const c = new CustomerBuilder()
      .withTenantId(TENANT_A)
      .withName('Carlos')
      .withEmail('carlos@example.com')
      .build();
    await repo.save(c);

    const useCase = await makeUseCase(TENANT_A);
    const result = await useCase.execute({ limit: 20 });

    expect(result.items[0]?.currentPoints).toBe(0);
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

    const useCase = await makeUseCase(TENANT_A);
    const result = await useCase.execute({ limit: 20 });

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

    const useCase = await makeUseCase(TENANT_A);
    const result = await useCase.execute({ limit: 3 });

    expect(result.items).toHaveLength(3);
    expect(result.total).toBe(5);
  });
});
