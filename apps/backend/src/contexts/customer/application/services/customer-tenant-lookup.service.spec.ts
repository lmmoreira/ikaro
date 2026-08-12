import { CustomerBuilder } from '../../../../test/builders/customer';
import { InMemoryCustomerRepository } from '../../../../test/repositories/customer/in-memory-customer.repository';
import { CustomerTenantLookupService } from './customer-tenant-lookup.service';

describe('CustomerTenantLookupService', () => {
  it('returns null when the customer does not belong to the supplied tenant', async () => {
    const service = new CustomerTenantLookupService(new InMemoryCustomerRepository());

    await expect(
      service.find({
        customerId: 'missing-customer',
        tenantId: '10000000-0000-4000-8000-000000000001',
      }),
    ).resolves.toBeNull();
  });

  it('returns every tenant record for the identified customer', async () => {
    const repository = new InMemoryCustomerRepository();
    const tenantId = '10000000-0000-4000-8000-000000000001';
    const customer = new CustomerBuilder().withTenantId(tenantId).build();
    await repository.save(customer);
    const service = new CustomerTenantLookupService(repository);

    await expect(service.find({ customerId: customer.id, tenantId })).resolves.toEqual([
      { customerId: customer.id, tenantId },
    ]);
  });
});
