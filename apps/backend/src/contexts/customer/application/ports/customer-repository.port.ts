import { Customer } from '../../domain/customer.aggregate';

export const CUSTOMER_REPOSITORY = Symbol('ICustomerRepository');

export interface CustomerTenantSummary {
  tenantId: string;
  customerId: string;
}

export interface CustomerSearchRow {
  customerId: string;
  name: string;
  email: string;
}

export interface ICustomerRepository {
  findByTenantAndOAuthId(tenantId: string, googleOAuthId: string): Promise<Customer | null>;
  findById(id: string, tenantId: string): Promise<Customer | null>;
  findAllTenantsByOAuthId(googleOAuthId: string): Promise<CustomerTenantSummary[]>;
  searchByTenant(
    tenantId: string,
    search: string | undefined,
    limit: number,
  ): Promise<{ rows: CustomerSearchRow[]; total: number }>;
  save(customer: Customer): Promise<void>;
}
