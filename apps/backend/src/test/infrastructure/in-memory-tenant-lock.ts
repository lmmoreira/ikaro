import { ITenantLockPort } from '../../contexts/booking/application/ports/tenant-lock.port';

export class InMemoryTenantLock implements ITenantLockPort {
  async lockTenantDay(_tenantId: string, _date: string): Promise<void> {
    return undefined;
  }
}
