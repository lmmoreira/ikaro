import {
  CustomerSearchRow,
  CustomerTenantSummary,
  ICustomerRepository,
} from '../../../contexts/customer/application/ports/customer-repository.port';
import { Customer } from '../../../contexts/customer/domain/customer.aggregate';

export class InMemoryCustomerRepository implements ICustomerRepository {
  private readonly store = new Map<string, Customer>();

  async findByTenantAndOAuthId(tenantId: string, googleOAuthId: string): Promise<Customer | null> {
    for (const customer of this.store.values()) {
      if (customer.tenantId === tenantId && customer.googleOAuthId === googleOAuthId) {
        return customer;
      }
    }
    return null;
  }

  async findById(id: string, tenantId: string): Promise<Customer | null> {
    const customer = this.store.get(id);
    if (customer?.tenantId === tenantId) return customer;
    return null;
  }

  async findAllTenantsByOAuthId(googleOAuthId: string): Promise<CustomerTenantSummary[]> {
    const results: CustomerTenantSummary[] = [];
    for (const customer of this.store.values()) {
      if (customer.googleOAuthId === googleOAuthId) {
        results.push({ tenantId: customer.tenantId, customerId: customer.id });
      }
    }
    return results;
  }

  async searchByTenant(
    tenantId: string,
    search: string | undefined,
    limit: number,
  ): Promise<{ rows: CustomerSearchRow[]; total: number }> {
    const term = search?.toLowerCase();
    const all = [...this.store.values()].filter((c) => {
      if (c.tenantId !== tenantId) return false;
      if (!term) return true;
      return c.name.toLowerCase().includes(term) || c.email.address.toLowerCase().includes(term);
    });
    const rows = all.slice(0, limit).map((c) => ({
      customerId: c.id,
      name: c.name,
      email: c.email.address,
    }));
    return { rows, total: all.length };
  }

  async save(customer: Customer): Promise<void> {
    this.store.set(customer.id, customer);
  }
}
