import { Customer } from '../../domain/customer.aggregate';

export const CUSTOMER_REPOSITORY = Symbol('ICustomerRepository');

export interface CustomerTenantSummary {
  tenantId: string;
  customerId: string;
}

export interface ICustomerRepository {
  findByTenantAndOAuthId(tenantId: string, googleOAuthId: string): Promise<Customer | null>;
  findById(id: string, tenantId: string): Promise<Customer | null>;
  findAllTenantsByOAuthId(googleOAuthId: string): Promise<CustomerTenantSummary[]>;
  save(customer: Customer): Promise<void>;
}
