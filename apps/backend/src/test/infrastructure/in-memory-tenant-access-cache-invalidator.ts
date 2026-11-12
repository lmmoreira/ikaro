import type { TenantAccessCacheInvalidator } from '../../contexts/billing/application/ports/tenant-access-cache-invalidator.port';
import type { InMemoryTransactionManager } from './in-memory-transaction-manager';

// Records each eviction and whether it happened inside a transaction, so a spec can pin "invalidated
// only after commit" with state instead of a jest.fn() call order.
export class InMemoryTenantAccessCacheInvalidator implements TenantAccessCacheInvalidator {
  readonly invalidated: string[] = [];
  readonly calledInsideTransaction: boolean[] = [];

  constructor(private readonly txManager?: InMemoryTransactionManager) {}

  async invalidate(tenantId: string): Promise<void> {
    this.invalidated.push(tenantId);
    this.calledInsideTransaction.push(this.txManager?.isInTransaction ?? false);
  }
}
