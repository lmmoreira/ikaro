import { CustomerTenantSummary } from './customer-repository.port';

export const CUSTOMER_TENANT_LOOKUP = Symbol('ICustomerTenantLookup');

export interface CustomerTenantLookupInput {
  customerId: string;
  tenantId: string;
}

export interface ICustomerTenantLookup {
  find(input: CustomerTenantLookupInput): Promise<CustomerTenantSummary[] | null>;
}
