import { HttpException, HttpStatus } from '@nestjs/common';
import { CustomerBuilder } from '../../../../test/builders/customer/customer.builder';
import { InMemoryCustomerRepository } from '../../../../test/repositories/customer/in-memory-customer.repository';
import { InMemoryTransactionManager } from '../../../../test/infrastructure/in-memory-transaction-manager';
import { RequestContextBuilder } from '../../../../test/factories/request-context.factory';
import { testAddressProps } from '../../../../test/utils/address-helpers';
import { GetCustomerProfileUseCase } from '../../application/use-cases/get-customer-profile.use-case';
import { GetCustomerTenantsByIdUseCase } from '../../application/use-cases/get-customer-tenants-by-id.use-case';
import { UpdateCustomerProfileUseCase } from '../../application/use-cases/update-customer-profile.use-case';
import { SearchCustomersUseCase } from '../../application/use-cases/search-customers.use-case';
import { CustomerController } from './customer.controller';

const TENANT_A = '10000000-0000-4000-8000-000000000140';

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

    const ctx = new RequestContextBuilder()
      .withTenantId(TENANT_A)
      .withActorId(customerId)
      .withActorType('CUSTOMER')
      .build();

    controller = new CustomerController(
      ctx,
      new GetCustomerProfileUseCase(repo, ctx),
      new UpdateCustomerProfileUseCase(repo, new InMemoryTransactionManager(), ctx),
      new SearchCustomersUseCase(repo, ctx),
      new GetCustomerTenantsByIdUseCase(repo),
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
      const ctx = new RequestContextBuilder()
        .withTenantId(TENANT_A)
        .withActorId('00000000-0000-4000-8000-000000009997')
        .withActorType('CUSTOMER')
        .build();
      const ctrl = new CustomerController(
        ctx,
        new GetCustomerProfileUseCase(repo, ctx),
        new UpdateCustomerProfileUseCase(repo, new InMemoryTransactionManager(), ctx),
        new SearchCustomersUseCase(repo, ctx),
        new GetCustomerTenantsByIdUseCase(repo),
      );
      const err = await ctrl.getMe().catch((e: unknown) => e);
      expect(err).toBeInstanceOf(HttpException);
      expect((err as HttpException).getStatus()).toBe(HttpStatus.NOT_FOUND);
    });
  });

  describe('updateMe()', () => {
    it('returns the updated profile', async () => {
      const result = await controller.updateMe({ name: 'Updated', phone: '+5531988888888' });
      expect(result.name).toBe('Updated');
      expect(result.phone).toBe('+5531988888888');
    });

    it('accepts a valid defaultAddress', async () => {
      const result = await controller.updateMe({ defaultAddress: testAddressProps() });
      expect(result.defaultAddress).not.toBeNull();
    });

    it('maps CustomerDomainError to 400 for invalid phone', async () => {
      const err = await controller.updateMe({ phone: '123' }).catch((e: unknown) => e);
      expect(err).toBeInstanceOf(HttpException);
      expect((err as HttpException).getStatus()).toBe(HttpStatus.BAD_REQUEST);
    });
  });

  describe('search()', () => {
    it('returns matching customers for the caller tenant', async () => {
      const result = await controller.search('Test', '20');
      expect(result.total).toBe(1);
      expect(result.items[0]?.name).toBe('Test Customer');
    });

    it('returns all customers when search is omitted', async () => {
      const result = await controller.search(undefined, '20');
      expect(result.total).toBe(1);
    });

    it('defaults to limit 20 when limit param is undefined', async () => {
      const result = await controller.search(undefined, undefined);
      expect(result.total).toBe(1);
    });

    it('respects the limit param', async () => {
      for (let i = 0; i < 3; i++) {
        await repo.save(
          new CustomerBuilder()
            .withTenantId(TENANT_A)
            .withName(`Extra ${i}`)
            .withEmail(`e${i}@x.com`)
            .build(),
        );
      }
      const result = await controller.search(undefined, '2');
      expect(result.items).toHaveLength(2);
      expect(result.total).toBe(4);
    });
  });

  describe('getMyTenants()', () => {
    const TENANT_B = '10000000-0000-4000-8000-000000000141';

    it('returns all tenants for the authenticated customer identified via RequestContext', async () => {
      // The customer created in beforeEach already has the default googleOAuthId 'google-sub-1'.
      // Add a second record at TENANT_B with the same OAuthId to simulate multi-tenant membership.
      const customerB = new CustomerBuilder()
        .withTenantId(TENANT_B)
        .withEmail('ctrl-b@example.com')
        .build();
      await repo.save(customerB);

      const result = await controller.getMyTenants();

      expect(result).toHaveLength(2);
      expect(result.map((r) => r.tenantId)).toEqual(expect.arrayContaining([TENANT_A, TENANT_B]));
    });

    it('maps CustomerNotFoundError to 404 when actorId is unknown', async () => {
      const ctx = new RequestContextBuilder()
        .withTenantId(TENANT_A)
        .withActorId('00000000-0000-4000-8000-000000009998')
        .withActorType('CUSTOMER')
        .build();
      const ctrl = new CustomerController(
        ctx,
        new GetCustomerProfileUseCase(repo, ctx),
        new UpdateCustomerProfileUseCase(repo, new InMemoryTransactionManager(), ctx),
        new SearchCustomersUseCase(repo, ctx),
        new GetCustomerTenantsByIdUseCase(repo),
      );
      const err = await ctrl.getMyTenants().catch((e: unknown) => e);
      expect(err).toBeInstanceOf(HttpException);
      expect((err as HttpException).getStatus()).toBe(HttpStatus.NOT_FOUND);
    });
  });
});
