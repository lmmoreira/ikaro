import { ITenantLockPort } from '../../contexts/booking/application/ports/tenant-lock.port';

export class InMemoryTenantLock implements ITenantLockPort {
  async lockTenantDay(_tenantId: string, _date: string): Promise<void> {
    return undefined;
  }

  async lockTenantStaff(_tenantId: string, _staffId: string): Promise<void> {
    return undefined;
  }
}
