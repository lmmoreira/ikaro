import { Injectable } from '@nestjs/common';
import { Address } from '../../../../shared/value-objects/address';
import { GetCustomerByIdUseCase } from '../../../customer/application/use-cases/get-customer-by-id.use-case';
import {
  CustomerProfileDto,
  IBookingCustomerPort,
} from '../../application/ports/booking-customer.port';

@Injectable()
export class BookingCustomerAdapter implements IBookingCustomerPort {
  constructor(private readonly getCustomerById: GetCustomerByIdUseCase) {}

  async findById(customerId: string, tenantId: string): Promise<CustomerProfileDto | null> {
    try {
      const customer = await this.getCustomerById.execute({ customerId, tenantId });
      return {
        email: customer.email,
        name: customer.name,
        phone: customer.phone,
        defaultAddress: customer.defaultAddress
          ? Address.reconstitute(customer.defaultAddress)
          : null,
      };
    } catch {
      return null;
    }
  }
}
