import { Injectable } from '@nestjs/common';
import { GetTenantByIdUseCase } from '../../../platform/application/use-cases/get-tenant-by-id.use-case';
import { TenantQueryService } from '../../../platform/application/services/tenant-query.service';
import {
  BookingSettings,
  BusinessHours,
} from '../../../platform/domain/value-objects/tenant-settings.vo';
import {
  ActiveTenantInfo,
  IBookingPlatformPort,
  SchedulingSettings,
} from '../../application/ports/booking-platform.port';

@Injectable()
export class BookingPlatformAdapter implements IBookingPlatformPort {
  constructor(
    private readonly getTenantById: GetTenantByIdUseCase,
    private readonly tenantQueryService: TenantQueryService,
  ) {}

  async findAllActive(): Promise<ActiveTenantInfo[]> {
    const tenants = await this.tenantQueryService.findAllActive();
    return tenants.map((t) => ({
      id: t.id,
      timezone: t.settings.business_hours?.timezone ?? 'UTC',
    }));
  }

  async getBusinessHours(tenantId: string): Promise<BusinessHours> {
    const { settings } = await this.getTenantById.execute(tenantId);
    return settings.business_hours;
  }

  async getBookingSettings(tenantId: string): Promise<BookingSettings> {
    const { settings } = await this.getTenantById.execute(tenantId);
    return settings.booking;
  }

  async getSchedulingSettings(tenantId: string): Promise<SchedulingSettings> {
    const { settings } = await this.getTenantById.execute(tenantId);
    return { businessHours: settings.business_hours, bookingSettings: settings.booking };
  }
}
