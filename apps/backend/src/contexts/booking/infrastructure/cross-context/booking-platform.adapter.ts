import { Inject, Injectable } from '@nestjs/common';
import { AppLogger } from '../../../../shared/observability/app-logger';
import {
  FRONTEND_REVALIDATION_PORT,
  IFrontendRevalidationPort,
} from '../../../platform/application/ports/frontend-revalidation.port';
import { HotsiteNotFoundError } from '../../../platform/domain/errors/platform-domain.error';
import { GetHotsiteContentUseCase } from '../../../platform/application/use-cases/get-hotsite-content.use-case';
import { GetTenantByIdUseCase } from '../../../platform/application/use-cases/get-tenant-by-id.use-case';
import { GetTenantsUseCase } from '../../../platform/application/use-cases/get-tenants.use-case';
import { GetTenantBusinessHoursForUpdateUseCase } from '../../../platform/application/use-cases/get-tenant-business-hours-for-update.use-case';
import {
  ActiveTenantInfo,
  AvailabilityAlertTenantContext,
  IBookingPlatformPort,
  TenantBusinessHoursAndLocale,
} from '../../application/ports/booking-platform.port';

// The carousel size the public booking page falls back to when the hotsite sets none
// (app/[slug]/booking/page.tsx) — the alert horizon must agree with what that page shows.
const DEFAULT_CAROUSEL_DAYS = 14;

@Injectable()
export class BookingPlatformAdapter implements IBookingPlatformPort {
  private readonly logger = new AppLogger(BookingPlatformAdapter.name);

  constructor(
    private readonly getTenants: GetTenantsUseCase,
    private readonly getTenantById: GetTenantByIdUseCase,
    private readonly getTenantBusinessHoursForUpdate: GetTenantBusinessHoursForUpdateUseCase,
    private readonly getHotsiteContent: GetHotsiteContentUseCase,
    @Inject(FRONTEND_REVALIDATION_PORT)
    private readonly frontendRevalidation: IFrontendRevalidationPort,
  ) {}

  async findAllActive(): Promise<ActiveTenantInfo[]> {
    const result = await this.getTenants.execute({ status: 'ACTIVE' });
    return result.items.map((tenant) => ({
      id: tenant.id,
      timezone: tenant.timezone,
    }));
  }

  // Best-effort per the port contract — the tenant lookup runs after the caller's write
  // transaction has already committed, so a failure here must never surface as an error for an
  // operation that already succeeded (frontendRevalidation.revalidate() is itself best-effort;
  // this try/catch covers the tenant lookup, the only other thing that can throw in this method).
  async revalidatePublicPages(tenantId: string): Promise<void> {
    try {
      const tenant = await this.getTenantById.execute({ tenantId });
      await this.frontendRevalidation.revalidate(tenant.slug);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'unknown error';
      this.logger.warn(`Hotsite revalidation skipped for tenant '${tenantId}': ${message}`);
    }
  }

  async getBusinessHoursAndLocale(tenantId: string): Promise<TenantBusinessHoursAndLocale> {
    const tenant = await this.getTenantById.execute({ tenantId });
    return {
      businessHours: tenant.settings.businessHours,
      locale: tenant.locale,
    };
  }

  async getBusinessHoursAndLocaleForUpdate(
    tenantId: string,
  ): Promise<TenantBusinessHoursAndLocale> {
    return this.getTenantBusinessHoursForUpdate.execute({ tenantId });
  }

  async getAutoApproveEnabled(tenantId: string): Promise<boolean> {
    const tenant = await this.getTenantById.execute({ tenantId });
    return tenant.settings.booking.autoApproveEnabled;
  }

  async getAvailabilityAlertContext(tenantId: string): Promise<AvailabilityAlertTenantContext> {
    const [tenant, picker] = await Promise.all([
      this.getTenantById.execute({ tenantId }),
      this.readBookingPicker(tenantId),
    ]);
    const { booking, businessHours } = tenant.settings;
    return {
      businessHours,
      slotGranularityMinutes: booking.slotGranularityMinutes,
      serviceBufferMinutes: booking.serviceBufferMinutes,
      selectableDays:
        picker.datePickerType === 'calendar'
          ? booking.maxBookingAdvanceDays
          : Math.min(picker.carouselDays, booking.maxBookingAdvanceDays),
    };
  }

  // The hotsite's BOOKING_CTA date picker, with the defaults the public booking page applies when
  // the module (or the whole hotsite config) is absent — the page itself picks the first
  // BOOKING_CTA module whether or not it is enabled, so this does too.
  private async readBookingPicker(
    tenantId: string,
  ): Promise<{ datePickerType: 'carousel' | 'calendar'; carouselDays: number }> {
    const defaults = { datePickerType: 'carousel' as const, carouselDays: DEFAULT_CAROUSEL_DAYS };
    try {
      const hotsite = await this.getHotsiteContent.execute({ tenantId });
      const data = hotsite.layout.find((module) => module.type === 'BOOKING_CTA')?.data;
      if (!data) return defaults;
      return {
        datePickerType:
          'datePickerType' in data && data.datePickerType === 'calendar' ? 'calendar' : 'carousel',
        carouselDays:
          'carouselDays' in data && typeof data.carouselDays === 'number'
            ? data.carouselDays
            : DEFAULT_CAROUSEL_DAYS,
      };
    } catch (err) {
      if (err instanceof HotsiteNotFoundError) return defaults;
      throw err;
    }
  }
}
