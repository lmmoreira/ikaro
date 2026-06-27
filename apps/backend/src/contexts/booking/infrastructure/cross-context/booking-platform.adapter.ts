import { Injectable } from '@nestjs/common';
import { GetTenantsUseCase } from '../../../platform/application/use-cases/get-tenants.use-case';
import {
  ActiveTenantInfo,
  IBookingPlatformPort,
} from '../../application/ports/booking-platform.port';

@Injectable()
export class BookingPlatformAdapter implements IBookingPlatformPort {
  constructor(private readonly getTenants: GetTenantsUseCase) {}

  async findAllActive(): Promise<ActiveTenantInfo[]> {
    const result = await this.getTenants.execute({ status: 'ACTIVE' });
    return result.items.map((tenant) => ({
      id: tenant.id,
      timezone: tenant.timezone,
    }));
  }
}
