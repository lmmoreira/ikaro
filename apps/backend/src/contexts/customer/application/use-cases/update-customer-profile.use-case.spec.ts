import {
  CustomerDomainError,
  CustomerNotFoundError,
} from '../../domain/errors/customer-domain.error';
import { CustomerBuilder } from '../../../../test/builders/customer/customer.builder';
import { InMemoryCustomerRepository } from '../../../../test/repositories/customer/in-memory-customer.repository';
import { InMemoryTransactionManager } from '../../../../test/infrastructure/in-memory-transaction-manager';
import { RequestContextBuilder } from '../../../../test/factories/request-context.factory';
import { UpdateCustomerProfileUseCase } from './update-customer-profile.use-case';

const validAddress = {
  street: 'Rua das Flores',
  number: '100',
  neighborhood: 'Centro',
  city: 'Belo Horizonte',
  state: 'MG',
  zipCode: '30100000',
};

const TENANT_A = '10000000-0000-4000-8000-000000000130';

describe('UpdateCustomerProfileUseCase', () => {
  let useCase: UpdateCustomerProfileUseCase;
  let repo: InMemoryCustomerRepository;
  let customerId: string;

  beforeEach(async () => {
    repo = new InMemoryCustomerRepository();
    const customer = new CustomerBuilder()
      .withTenantId(TENANT_A)
      .withName('Original Name')
      .withEmail('original@example.com')
      .build();
    await repo.save(customer);
    customerId = customer.id;

    const ctx = new RequestContextBuilder()
      .withTenantId(TENANT_A)
      .withActorId(customerId)
      .withActorType('CUSTOMER')
      .build();
    useCase = new UpdateCustomerProfileUseCase(repo, new InMemoryTransactionManager(), ctx);
  });

  it('updates name when provided', async () => {
    const result = await useCase.execute({ name: 'New Name' });
    expect(result.name).toBe('New Name');
    expect(result.email).toBe('original@example.com');
  });

  it('updates phone when provided', async () => {
    const result = await useCase.execute({ phone: '+5531999999999' });
    expect(result.phone).toBe('+5531999999999');
  });

  it('clears phone when set to null', async () => {
    await useCase.execute({ phone: '+5531999999999' });
    const result = await useCase.execute({ phone: null });
    expect(result.phone).toBeNull();
  });

  it('updates defaultAddress when provided', async () => {
    const result = await useCase.execute({ defaultAddress: validAddress });
    expect(result.defaultAddress).not.toBeNull();
    expect(result.defaultAddress!.city).toBe(validAddress.city);
  });

  it('clears defaultAddress when set to null', async () => {
    await useCase.execute({ defaultAddress: validAddress });
    const result = await useCase.execute({ defaultAddress: null });
    expect(result.defaultAddress).toBeNull();
  });

  it('leaves unchanged fields untouched on partial update', async () => {
    await useCase.execute({ phone: '+5531988888888' });
    const result = await useCase.execute({ name: 'Updated Name' });
    expect(result.name).toBe('Updated Name');
    expect(result.phone).toBe('+5531988888888');
  });

  it('throws CustomerNotFoundError when actorId has no matching customer', async () => {
    const ctx = new RequestContextBuilder()
      .withTenantId(TENANT_A)
      .withActorId('00000000-0000-4000-8000-000000009998')
      .withActorType('CUSTOMER')
      .build();
    const uc = new UpdateCustomerProfileUseCase(repo, new InMemoryTransactionManager(), ctx);
    await expect(uc.execute({ name: 'X' })).rejects.toBeInstanceOf(CustomerNotFoundError);
  });

  it('throws CustomerDomainError for invalid phone', async () => {
    await expect(useCase.execute({ phone: '123' })).rejects.toBeInstanceOf(CustomerDomainError);
  });

  it('throws for invalid zipCode in address (VO validation)', async () => {
    await expect(
      useCase.execute({ defaultAddress: { ...validAddress, zipCode: '123' } }),
    ).rejects.toThrow();
  });
});
