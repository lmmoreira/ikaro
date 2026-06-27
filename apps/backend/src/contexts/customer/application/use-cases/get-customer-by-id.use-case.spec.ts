import { CustomerBuilder } from '../../../../test/builders/customer';
import { InMemoryCustomerRepository } from '../../../../test/repositories/customer/in-memory-customer.repository';
import { CustomerNotFoundError } from '../../domain/errors/customer-domain.error';
import { GetCustomerByIdUseCase } from './get-customer-by-id.use-case';

const TENANT_A = '10000000-0000-4000-8000-000000000001';
const TENANT_B = '10000000-0000-4000-8000-000000000002';

describe('GetCustomerByIdUseCase', () => {
  let repo: InMemoryCustomerRepository;
  let useCase: GetCustomerByIdUseCase;

  beforeEach(() => {
    repo = new InMemoryCustomerRepository();
    useCase = new GetCustomerByIdUseCase(repo);
  });

  it('returns customer DTO for the tenant', async () => {
    const customer = new CustomerBuilder()
      .withTenantId(TENANT_A)
      .withEmail('cliente@lavacar.com.br')
      .withName('Cliente Silva')
      .build();
    await repo.save(customer);

    const result = await useCase.execute(customer.id, TENANT_A);

    expect(result).toMatchObject({
      id: customer.id,
      tenantId: TENANT_A,
      email: 'cliente@lavacar.com.br',
      name: 'Cliente Silva',
    });
  });

  it('throws CustomerNotFoundError when customer does not exist', async () => {
    await expect(useCase.execute('missing-id', TENANT_A)).rejects.toBeInstanceOf(
      CustomerNotFoundError,
    );
  });

  it('tenant isolation: throws when customer belongs to another tenant', async () => {
    const customer = new CustomerBuilder().withTenantId(TENANT_B).build();
    await repo.save(customer);

    await expect(useCase.execute(customer.id, TENANT_A)).rejects.toBeInstanceOf(
      CustomerNotFoundError,
    );
  });
});
