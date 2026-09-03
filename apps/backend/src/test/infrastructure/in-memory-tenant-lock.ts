import { ITenantLockPort } from '../../shared/ports/tenant-lock.port';

export class InMemoryTenantLock implements ITenantLockPort {
  async lockTenantDay(_tenantId: string, _date: string): Promise<void> {
    return undefined;
  }

  async lockTenantSettings(_tenantId: string): Promise<void> {
    return undefined;
  }
}
