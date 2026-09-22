import {
  CustomerTenantLookupInput,
  ICustomerTenantLookup,
} from '../../contexts/customer/application/ports/customer-tenant-lookup.port';
import { CustomerTenantSummary } from '../../contexts/customer/application/ports/customer-repository.port';

// Sentinel so `undefined`/`null` can themselves be injected as the rejection value — mirrors
// InMemoryCachePort's failNextGet/Set/Del convention (docs/ENGINEERING_RULES.md § InMemory
// doubles): "no pending failure" is tracked by field presence, not by the value's own truthiness.
const NONE = Symbol('no pending find failure');

export class InMemoryCustomerTenantLookup implements ICustomerTenantLookup {
  readonly findCalls: CustomerTenantLookupInput[] = [];
  private nextResult: CustomerTenantSummary[] | null = null;
  private nextError: unknown = NONE;

  async find(input: CustomerTenantLookupInput): Promise<CustomerTenantSummary[] | null> {
    this.findCalls.push(input);
    if (this.nextError !== NONE) {
      const err = this.nextError;
      this.nextError = NONE;
      throw err;
    }
    return this.nextResult;
  }

  setNextResult(result: CustomerTenantSummary[] | null): void {
    this.nextResult = result;
  }

  failNextFind(error: unknown): void {
    this.nextError = error;
  }
}
