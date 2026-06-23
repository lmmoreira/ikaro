import { Injectable } from '@nestjs/common';
import { BookingQueryService } from '../../../booking/application/services/booking-query.service';
import { ServiceQueryService } from '../../../booking/application/services/service-query.service';
import { ILoyaltyBookingPort, ServiceSummary } from '../../application/ports/loyalty-booking.port';

@Injectable()
export class LoyaltyBookingAdapter implements ILoyaltyBookingPort {
  constructor(
    private readonly serviceQueryService: ServiceQueryService,
    private readonly bookingQueryService: BookingQueryService,
  ) {}

  async findServicesByIds(tenantId: string, serviceIds: string[]): Promise<ServiceSummary[]> {
    if (serviceIds.length === 0) return [];
    const services = await this.serviceQueryService.findByIds(serviceIds, tenantId);
    return services.map((s) => ({ serviceId: s.id, serviceName: s.name }));
  }

  async findBookingServices(tenantId: string, bookingId: string): Promise<ServiceSummary[]> {
    const booking = await this.bookingQueryService.findById(bookingId, tenantId);
    if (!booking) return [];
    return booking.lines.map((l) => ({
      serviceId: l.serviceId,
      serviceName: l.serviceNameAtBooking,
    }));
  }
}
