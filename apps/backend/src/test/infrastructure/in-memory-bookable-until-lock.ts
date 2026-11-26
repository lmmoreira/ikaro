import type { BookableUntilLockPort } from '../../shared/ports/bookable-until-lock.port';

// Records the calls so a spec can assert the guard took the shared mode first, without a database.
export class InMemoryBookableUntilLock implements BookableUntilLockPort {
  readonly calls: { mode: 'shared' | 'exclusive'; tenantId: string }[] = [];

  async lockCommitmentsShared(tenantId: string): Promise<void> {
    this.calls.push({ mode: 'shared', tenantId });
  }

  async lockCommitmentsExclusive(tenantId: string): Promise<void> {
    this.calls.push({ mode: 'exclusive', tenantId });
  }
}
