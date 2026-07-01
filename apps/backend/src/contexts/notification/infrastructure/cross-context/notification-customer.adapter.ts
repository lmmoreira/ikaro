import { Injectable } from '@nestjs/common';
import { GetCustomerByIdUseCase } from '../../../customer/application/use-cases/get-customer-by-id.use-case';
import {
  INotificationCustomerPort,
  NotificationCustomerInfo,
} from '../../application/ports/notification-customer.port';

@Injectable()
export class NotificationCustomerAdapter implements INotificationCustomerPort {
  constructor(private readonly getCustomerById: GetCustomerByIdUseCase) {}

  async getCustomerInfo(
    customerId: string,
    tenantId: string,
  ): Promise<NotificationCustomerInfo | null> {
    try {
      const customer = await this.getCustomerById.execute({ customerId, tenantId });
      return { email: customer.email, name: customer.name };
    } catch {
      return null;
    }
  }
}
