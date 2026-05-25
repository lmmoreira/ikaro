import { HttpException, HttpStatus } from '@nestjs/common';
import { CustomerBuilder } from '../../../../test/builders/customer/customer.builder';
import { InMemoryCustomerRepository } from '../../../../test/repositories/customer/in-memory-customer.repository';
import { InMemoryTransactionManager } from '../../../../test/infrastructure/in-memory-transaction-manager';
import { TenantContextBuilder } from '../../../../test/factories/tenant-context.factory';
import { GetCustomerProfileUseCase } from '../../application/use-cases/get-customer-profile.use-case';
import { UpdateCustomerProfileUseCase } from '../../application/use-cases/update-customer-profile.use-case';
import { CustomerController } from './customer.controller';

const TENANT_A = '10000000-0000-4000-8000-000000000140';

const validAddress = {
  street: 'Rua das Flores',
  number: '100',
  neighborhood: 'Centro',
  city: 'Belo Horizonte',
  state: 'MG',
  zipCode: '30100000',
};

describe('CustomerController', () => {
  let controller: CustomerController;
  let repo: InMemoryCustomerRepository;
  let customerId: string;

  beforeEach(async () => {
    repo = new InMemoryCustomerRepository();
    const customer = new CustomerBuilder()
      .withTenantId(TENANT_A)
      .withName('Test Customer')
      .withEmail('ctrl@example.com')
      .build();
    await repo.save(customer);
    customerId = customer.id;

    const ctx = new TenantContextBuilder()
      .withTenantId(TENANT_A)
      .withActorId(customerId)
      .withActorType('CUSTOMER')
      .build();

    controller = new CustomerController(
      new GetCustomerProfileUseCase(repo, ctx),
      new UpdateCustomerProfileUseCase(repo, new InMemoryTransactionManager(), ctx),
    );
  });

  describe('getMe()', () => {
    it('returns the customer profile', async () => {
      const result = await controller.getMe();
      expect(result.customerId).toBe(customerId);
      expect(result.email).toBe('ctrl@example.com');
      expect(result.name).toBe('Test Customer');
      expect(result.phone).toBeNull();
    });

    it('maps CustomerNotFoundError to 404', async () => {
      const ctx = new TenantContextBuilder()
        .withTenantId(TENANT_A)
        .withActorId('00000000-0000-4000-8000-000000009997')
        .withActorType('CUSTOMER')
        .build();
      const ctrl = new CustomerController(
        new GetCustomerProfileUseCase(repo, ctx),
        new UpdateCustomerProfileUseCase(repo, new InMemoryTransactionManager(), ctx),
      );
      const err = await ctrl.getMe().catch((e: unknown) => e);
      expect(err).toBeInstanceOf(HttpException);
      expect((err as HttpException).getStatus()).toBe(HttpStatus.NOT_FOUND);
    });
  });

  describe('updateMe()', () => {
    it('returns the updated profile', async () => {
      const result = await controller.updateMe({ name: 'Updated', phone: '31988888888' });
      expect(result.name).toBe('Updated');
      expect(result.phone).toBe('31988888888');
    });

    it('accepts a valid defaultAddress', async () => {
      const result = await controller.updateMe({ defaultAddress: validAddress });
      expect(result.defaultAddress).not.toBeNull();
    });

    it('maps CustomerDomainError to 400 for invalid phone', async () => {
      const err = await controller.updateMe({ phone: '123' }).catch((e: unknown) => e);
      expect(err).toBeInstanceOf(HttpException);
      expect((err as HttpException).getStatus()).toBe(HttpStatus.BAD_REQUEST);
    });
  });
});
