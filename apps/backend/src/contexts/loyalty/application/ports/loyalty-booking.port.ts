export const LOYALTY_BOOKING_PORT = Symbol('ILoyaltyBookingPort');

export interface ServiceSummary {
  serviceId: string;
  serviceName: string;
}

export interface ILoyaltyBookingPort {
  findServicesByIds(tenantId: string, serviceIds: string[]): Promise<ServiceSummary[]>;
  findBookingServices(tenantId: string, bookingId: string): Promise<ServiceSummary[]>;
}
