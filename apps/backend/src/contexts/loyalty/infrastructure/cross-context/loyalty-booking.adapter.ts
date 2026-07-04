import { Injectable } from '@nestjs/common';
import { GetBookingByIdUseCase } from '../../../booking/application/use-cases/get-booking-by-id.use-case';
import { GetServicesUseCase } from '../../../booking/application/use-cases/get-services.use-case';
import { ILoyaltyBookingPort, ServiceSummary } from '../../application/ports/loyalty-booking.port';

@Injectable()
export class LoyaltyBookingAdapter implements ILoyaltyBookingPort {
  constructor(
    private readonly getServices: GetServicesUseCase,
    private readonly getBookingById: GetBookingByIdUseCase,
  ) {}

  async findServicesByIds(tenantId: string, serviceIds: string[]): Promise<ServiceSummary[]> {
    if (serviceIds.length === 0) return [];
    const result = await this.getServices.execute({ tenantId, ids: serviceIds });
    return result.items.map((service) => ({ serviceId: service.id, serviceName: service.name }));
  }

  async findBookingServices(tenantId: string, bookingId: string): Promise<ServiceSummary[]> {
    try {
      // cancellationWindowHours only affects the response's cancellableUntil field, which this
      // adapter never reads (it maps line service names only) — 0 is a safe unused placeholder.
      const booking = await this.getBookingById.execute({
        bookingId,
        tenantId,
        locale: 'pt-BR',
        cancellationWindowHours: 0,
      });
      return booking.lines.map((line) => ({
        serviceId: line.serviceId,
        serviceName: line.serviceNameAtBooking,
      }));
    } catch {
      return [];
    }
  }
}
