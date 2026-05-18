import { BadRequestException, HttpException, HttpStatus } from '@nestjs/common';
import { CustomerBuilder } from '../../../../test/builders/customer';
import { InMemoryCustomerRepository } from '../../../../test/repositories/customer/in-memory-customer.repository';
import { FindOrCreateCustomerDto } from '../../application/dtos/find-or-create-customer.dto';
import { FindOrCreateCustomerUseCase } from '../../application/use-cases/find-or-create-customer.use-case';
import { GetCustomerTenantsByIdUseCase } from '../../application/use-cases/get-customer-tenants-by-id.use-case';
import { GetCustomerTenantsUseCase } from '../../application/use-cases/get-customer-tenants.use-case';
import { InternalCustomerController } from './internal-customer.controller';

describe('InternalCustomerController', () => {
  let repo: InMemoryCustomerRepository;
  let controller: InternalCustomerController;

  beforeEach(() => {
    repo = new InMemoryCustomerRepository();
    controller = new InternalCustomerController(
      new GetCustomerTenantsUseCase(repo),
      new GetCustomerTenantsByIdUseCase(repo),
      new FindOrCreateCustomerUseCase(repo),
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

  describe('getTenantsById()', () => {
    it('throws BadRequestException when tenantId query param is missing', async () => {
      await expect(
        controller.getTenantsById('10000000-0000-4000-8000-000000000001', ''),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('maps CustomerNotFoundError to 404 when customer does not exist', async () => {
      const err = await controller
        .getTenantsById(
          '10000000-0000-4000-8000-000000000001',
          '10000000-0000-4000-8000-000000000002',
        )
        .catch((e: unknown) => e);

      expect(err).toBeInstanceOf(HttpException);
      expect((err as HttpException).getStatus()).toBe(HttpStatus.NOT_FOUND);
    });

    it('returns all tenants for the customer identified by (customerId, tenantId)', async () => {
      const sub = 'google-sub-switch';
      const tenantA = '10000000-0000-4000-8000-000000000001';
      const tenantB = '10000000-0000-4000-8000-000000000002';
      const customerA = new CustomerBuilder().withTenantId(tenantA).withGoogleOAuthId(sub).build();
      const customerB = new CustomerBuilder().withTenantId(tenantB).withGoogleOAuthId(sub).build();
      await repo.save(customerA);
      await repo.save(customerB);

      const result = await controller.getTenantsById(customerA.id, tenantA);

      expect(result).toHaveLength(2);
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
