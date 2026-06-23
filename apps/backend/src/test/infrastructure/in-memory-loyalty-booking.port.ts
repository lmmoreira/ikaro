import {
  ILoyaltyBookingPort,
  ServiceSummary,
} from '../../contexts/loyalty/application/ports/loyalty-booking.port';

export class InMemoryLoyaltyBookingPort implements ILoyaltyBookingPort {
  private readonly services: ServiceSummary[] = [];
  private readonly bookingServices = new Map<string, ServiceSummary[]>();

  seed(services: ServiceSummary[]): void {
    this.services.push(...services);
  }

  seedBookingServices(bookingId: string, services: ServiceSummary[]): void {
    this.bookingServices.set(bookingId, services);
  }

  async findServicesByIds(_tenantId: string, serviceIds: string[]): Promise<ServiceSummary[]> {
    return this.services.filter((s) => serviceIds.includes(s.serviceId));
  }

  async findBookingServices(_tenantId: string, bookingId: string): Promise<ServiceSummary[]> {
    return this.bookingServices.get(bookingId) ?? [];
  }

  clear(): void {
    this.services.length = 0;
    this.bookingServices.clear();
  }
}
