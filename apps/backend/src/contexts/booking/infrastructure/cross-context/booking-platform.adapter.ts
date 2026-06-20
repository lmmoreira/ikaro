import { Injectable } from '@nestjs/common';
import { TenantQueryService } from '../../../platform/application/services/tenant-query.service';
import {
  ActiveTenantInfo,
  IBookingPlatformPort,
} from '../../application/ports/booking-platform.port';

@Injectable()
export class BookingPlatformAdapter implements IBookingPlatformPort {
  constructor(private readonly tenantQueryService: TenantQueryService) {}

  async findAllActive(): Promise<ActiveTenantInfo[]> {
    const tenants = await this.tenantQueryService.findAllActive();
    return tenants.map((t) => ({
      id: t.id,
      timezone: t.settings.business_hours?.timezone ?? 'UTC',
    }));
  }
}
