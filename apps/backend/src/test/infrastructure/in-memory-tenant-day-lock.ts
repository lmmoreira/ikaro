import { ITenantDayLockPort } from '../../contexts/booking/application/ports/tenant-day-lock.port';

export class InMemoryTenantDayLock implements ITenantDayLockPort {
  async lockTenantDay(_tenantId: string, _date: string): Promise<void> {
    return undefined;
  }
}
