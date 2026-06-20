import {
  ActiveTenantInfo,
  IBookingPlatformPort,
} from '../../contexts/booking/application/ports/booking-platform.port';

export class InMemoryBookingPlatformPort implements IBookingPlatformPort {
  private readonly tenants: ActiveTenantInfo[] = [];

  seed(tenants: ActiveTenantInfo[]): void {
    this.tenants.push(...tenants);
  }

  clear(): void {
    this.tenants.length = 0;
  }

  async findAllActive(): Promise<ActiveTenantInfo[]> {
    return [...this.tenants];
  }
}
