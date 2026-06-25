import { BadRequestException } from '@nestjs/common';
import { CustomerBuilder } from '../../../../test/builders/customer';
import { InMemoryTransactionManager } from '../../../../test/infrastructure/in-memory-transaction-manager';
import { InMemoryCustomerRepository } from '../../../../test/repositories/customer/in-memory-customer.repository';
import { FindOrCreateCustomerDto } from '../../application/dtos/find-or-create-customer.dto';
import { FindOrCreateCustomerUseCase } from '../../application/use-cases/find-or-create-customer.use-case';
import { GetCustomerTenantsUseCase } from '../../application/use-cases/get-customer-tenants.use-case';
import { InternalCustomerController } from './internal-customer.controller';

describe('InternalCustomerController', () => {
  let repo: InMemoryCustomerRepository;
  let controller: InternalCustomerController;

  beforeEach(() => {
    repo = new InMemoryCustomerRepository();
    controller = new InternalCustomerController(
      new GetCustomerTenantsUseCase(repo),
      new FindOrCreateCustomerUseCase(repo, new InMemoryTransactionManager()),
    );
  });

  describe('getTenants()', () => {
    it('throws BadRequestException when googleOAuthId is missing', () => {
      expect(() => controller.getTenants('')).toThrow(BadRequestException);
    });

    it('returns empty array when no customer records exist', async () => {
      expect(await controller.getTenants('unknown-sub')).toEqual([]);
    });

    it('returns matching tenant entries for a known googleOAuthId', async () => {
      const customer = new CustomerBuilder()
        .withTenantId('00000000-0000-0000-0000-000000000001')
        .withGoogleOAuthId('google-sub-123')
        .build();
      await repo.save(customer);

      const result = await controller.getTenants('google-sub-123');

      expect(result).toHaveLength(1);
      expect(result[0].tenantId).toBe('00000000-0000-0000-0000-000000000001');
    });
  });

  describe('findOrCreate()', () => {
    const validBody: FindOrCreateCustomerDto = {
      tenantId: '10000000-0000-4000-8000-000000000001',
      googleOAuthId: 'google-sub-456',
      email: 'maria@lavacar.com.br',
      name: 'Maria Silva',
    };

    it('creates and returns a new customer on first call', async () => {
      const result = await controller.findOrCreate(validBody);

      expect(result.created).toBe(true);
      expect(result.customerId).toBeTruthy();
    });

    it('returns the existing customer without duplication on repeated calls', async () => {
      const first = await controller.findOrCreate(validBody);
      const second = await controller.findOrCreate(validBody);

      expect(second.created).toBe(false);
      expect(second.customerId).toBe(first.customerId);
    });
  });
});
