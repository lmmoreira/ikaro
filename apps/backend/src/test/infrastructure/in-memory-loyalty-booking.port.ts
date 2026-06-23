import {
  ILoyaltyBookingPort,
  ServiceSummary,
} from '../../contexts/loyalty/application/ports/loyalty-booking.port';

export class InMemoryLoyaltyBookingPort implements ILoyaltyBookingPort {
  private readonly services: ServiceSummary[] = [];
  private readonly bookingServices = new Map<string, Map<string, ServiceSummary[]>>();

  seed(services: ServiceSummary[]): void {
    this.services.push(...services);
  }

  seedBookingServices(tenantId: string, bookingId: string, services: ServiceSummary[]): void {
    const tenantBookings =
      this.bookingServices.get(tenantId) ?? new Map<string, ServiceSummary[]>();
    tenantBookings.set(bookingId, services);
    this.bookingServices.set(tenantId, tenantBookings);
  }

  async findServicesByIds(_tenantId: string, serviceIds: string[]): Promise<ServiceSummary[]> {
    return this.services.filter((s) => serviceIds.includes(s.serviceId));
  }

  async findBookingServices(tenantId: string, bookingId: string): Promise<ServiceSummary[]> {
    return this.bookingServices.get(tenantId)?.get(bookingId) ?? [];
  }

  clear(): void {
    this.services.length = 0;
    this.bookingServices.clear();
  }
}
