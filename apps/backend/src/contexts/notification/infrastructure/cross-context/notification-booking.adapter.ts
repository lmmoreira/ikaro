import { Injectable } from '@nestjs/common';
import { GetServicesUseCase } from '../../../booking/application/use-cases/get-services.use-case';
import {
  INotificationBookingPort,
  NotificationServiceInfo,
} from '../../application/ports/notification-booking.port';

@Injectable()
export class NotificationBookingAdapter implements INotificationBookingPort {
  constructor(private readonly getServices: GetServicesUseCase) {}

  async findServicesByIds(
    tenantId: string,
    serviceIds: string[],
  ): Promise<NotificationServiceInfo[]> {
    if (serviceIds.length === 0) return [];
    const result = await this.getServices.execute({ tenantId, ids: serviceIds });
    return result.items.map((service) => ({ serviceId: service.id, serviceName: service.name }));
  }
}
