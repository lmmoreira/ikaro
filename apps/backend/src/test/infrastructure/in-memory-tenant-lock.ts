import { ITenantLockPort } from '../../contexts/booking/application/ports/tenant-lock.port';

export class InMemoryTenantLock implements ITenantLockPort {
  lockTenantDay(_tenantId: string, _date: string): Promise<void> {
    return Promise.resolve();
  }

  lockTenantStaff(_tenantId: string, _staffId: string): Promise<void> {
    return Promise.resolve();
  }

  lockResources(_tenantId: string, _resourceIds: string[]): Promise<void> {
    return Promise.resolve();
  }

  lockService(_tenantId: string, _serviceId: string): Promise<void> {
    return Promise.resolve();
  }

  lockCustomerAlerts(_tenantId: string, _customerId: string): Promise<void> {
    return Promise.resolve();
  }
}
