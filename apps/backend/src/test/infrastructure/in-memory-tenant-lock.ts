import { ITenantLockPort } from '../../contexts/booking/application/ports/tenant-lock.port';

export class InMemoryTenantLock implements ITenantLockPort {
  async lockTenantDay(_tenantId: string, _date: string): Promise<void> {
    return undefined;
  }

  async lockTenantStaff(_tenantId: string, _staffId: string): Promise<void> {
    return undefined;
  }

  async lockResources(_tenantId: string, _resourceIds: string[]): Promise<void> {
    return undefined;
  }

  async lockService(_tenantId: string, _serviceId: string): Promise<void> {
    return undefined;
  }

  async lockCustomerAlerts(_tenantId: string, _customerId: string): Promise<void> {
    return undefined;
  }
}
