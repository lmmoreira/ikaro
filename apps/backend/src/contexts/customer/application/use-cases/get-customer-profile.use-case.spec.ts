import { CustomerNotFoundError } from '../../domain/errors/customer-domain.error';
import { CustomerBuilder } from '../../../../test/builders/customer/customer.builder';
import { InMemoryCustomerRepository } from '../../../../test/repositories/customer/in-memory-customer.repository';
import { RequestContextBuilder } from '../../../../test/factories/request-context.factory';
import { GetCustomerProfileUseCase } from './get-customer-profile.use-case';

const TENANT_A = '10000000-0000-4000-8000-000000000120';

describe('GetCustomerProfileUseCase', () => {
  let useCase: GetCustomerProfileUseCase;
  let repo: InMemoryCustomerRepository;

  beforeEach(async () => {
    repo = new InMemoryCustomerRepository();
    const customer = new CustomerBuilder()
      .withTenantId(TENANT_A)
      .withEmail('test@example.com')
      .build();
    await repo.save(customer);

    const ctx = new RequestContextBuilder()
      .withTenantId(TENANT_A)
      .withActorId(customer.id)
      .withActorType('CUSTOMER')
      .build();
    useCase = new GetCustomerProfileUseCase(repo, ctx);
  });

  it('returns the customer profile for the actor', async () => {
    const result = await useCase.execute();
    expect(result.email).toBe('test@example.com');
    expect(result.name).toBeDefined();
    expect(result.phone).toBeNull();
    expect(result.defaultAddress).toBeNull();
  });

  it('throws CustomerNotFoundError when actorId has no matching customer', async () => {
    const ctx = new RequestContextBuilder()
      .withTenantId(TENANT_A)
      .withActorId('00000000-0000-4000-8000-000000009999')
      .withActorType('CUSTOMER')
      .build();
    const uc = new GetCustomerProfileUseCase(repo, ctx);
    await expect(uc.execute()).rejects.toBeInstanceOf(CustomerNotFoundError);
  });

  it('throws CustomerNotFoundError when tenant does not match', async () => {
    const TENANT_B = '10000000-0000-4000-8000-000000000121';
    const customer = new CustomerBuilder().withTenantId(TENANT_A).build();
    await repo.save(customer);
    const ctx = new RequestContextBuilder()
      .withTenantId(TENANT_B)
      .withActorId(customer.id)
      .withActorType('CUSTOMER')
      .build();
    const uc = new GetCustomerProfileUseCase(repo, ctx);
    await expect(uc.execute()).rejects.toBeInstanceOf(CustomerNotFoundError);
  });
});
