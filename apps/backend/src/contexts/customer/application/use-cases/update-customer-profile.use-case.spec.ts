import { AddressErrorCode } from '@ikaro/types';
import {
  CustomerAddressValidationError,
  CustomerDomainError,
  CustomerNotFoundError,
} from '../../domain/errors/customer-domain.error';
import { CustomerBuilder } from '../../../../test/builders/customer/customer.builder';
import { InMemoryCustomerRepository } from '../../../../test/repositories/customer/in-memory-customer.repository';
import { InMemoryTransactionManager } from '../../../../test/infrastructure/in-memory-transaction-manager';
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
const COUNTRY_CODE = 'BR';

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
    useCase = new UpdateCustomerProfileUseCase(repo, new InMemoryTransactionManager());
  });

  it('updates name when provided', async () => {
    const result = await useCase.execute({
      tenantId: TENANT_A,
      customerId,
      countryCode: COUNTRY_CODE,
      name: 'New Name',
    });
    expect(result.name).toBe('New Name');
    expect(result.email).toBe('original@example.com');
  });

  it('updates phone when provided', async () => {
    const result = await useCase.execute({
      tenantId: TENANT_A,
      customerId,
      countryCode: COUNTRY_CODE,
      phone: '+5531999999999',
    });
    expect(result.phone).toBe('+5531999999999');
  });

  it('clears phone when set to null', async () => {
    await useCase.execute({
      tenantId: TENANT_A,
      customerId,
      countryCode: COUNTRY_CODE,
      phone: '+5531999999999',
    });
    const result = await useCase.execute({
      tenantId: TENANT_A,
      customerId,
      countryCode: COUNTRY_CODE,
      phone: null,
    });
    expect(result.phone).toBeNull();
  });

  it('updates defaultAddress when provided', async () => {
    const result = await useCase.execute({
      tenantId: TENANT_A,
      customerId,
      countryCode: COUNTRY_CODE,
      defaultAddress: validAddress,
    });
    expect(result.defaultAddress).not.toBeNull();
    expect(result.defaultAddress!.city).toBe(validAddress.city);
  });

  it('clears defaultAddress when set to null', async () => {
    await useCase.execute({
      tenantId: TENANT_A,
      customerId,
      countryCode: COUNTRY_CODE,
      defaultAddress: validAddress,
    });
    const result = await useCase.execute({
      tenantId: TENANT_A,
      customerId,
      countryCode: COUNTRY_CODE,
      defaultAddress: null,
    });
    expect(result.defaultAddress).toBeNull();
  });

  it('leaves unchanged fields untouched on partial update', async () => {
    await useCase.execute({
      tenantId: TENANT_A,
      customerId,
      countryCode: COUNTRY_CODE,
      phone: '+5531988888888',
    });
    const result = await useCase.execute({
      tenantId: TENANT_A,
      customerId,
      countryCode: COUNTRY_CODE,
      name: 'Updated Name',
    });
    expect(result.name).toBe('Updated Name');
    expect(result.phone).toBe('+5531988888888');
  });

  it('throws CustomerNotFoundError when customerId has no matching customer', async () => {
    const unknownId = '00000000-0000-4000-8000-000000009998';
    await expect(
      useCase.execute({
        tenantId: TENANT_A,
        customerId: unknownId,
        countryCode: COUNTRY_CODE,
        name: 'X',
      }),
    ).rejects.toBeInstanceOf(CustomerNotFoundError);
  });

  it('throws CustomerDomainError for invalid phone', async () => {
    await expect(
      useCase.execute({ tenantId: TENANT_A, customerId, countryCode: COUNTRY_CODE, phone: '123' }),
    ).rejects.toBeInstanceOf(CustomerDomainError);
  });

  it('wraps invalid zipCode in address into CustomerAddressValidationError with field: contactAddress', async () => {
    let caught: unknown;
    try {
      await useCase.execute({
        tenantId: TENANT_A,
        customerId,
        countryCode: COUNTRY_CODE,
        defaultAddress: { ...validAddress, zipCode: '123' },
      });
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(CustomerAddressValidationError);
    expect((caught as CustomerAddressValidationError).code).toBe(
      AddressErrorCode.POSTAL_CODE_INVALID,
    );
    expect((caught as CustomerAddressValidationError).field).toBe('contactAddress');
  });
});
