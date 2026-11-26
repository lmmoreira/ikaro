import { Inject, Injectable } from '@nestjs/common';
import { AppLogger } from '../../../../shared/observability/app-logger';
import {
  TENANT_ACCESS_PORT,
  type TenantAccessPort,
} from '../../../../shared/ports/tenant-access.port';
import { clampAdvanceDaysToBookableUntil } from '../../../../shared/utils/bookable-until-days';
import {
  FRONTEND_REVALIDATION_PORT,
  IFrontendRevalidationPort,
} from '../../../platform/application/ports/frontend-revalidation.port';
import { GetHotsiteBookingPickerUseCase } from '../../../platform/application/use-cases/get-hotsite-booking-picker.use-case';
import { GetTenantByIdUseCase } from '../../../platform/application/use-cases/get-tenant-by-id.use-case';
import { GetTenantBusinessHoursForUpdateUseCase } from '../../../platform/application/use-cases/get-tenant-business-hours-for-update.use-case';
import {
  AvailabilityAlertTenantContext,
  IBookingPlatformPort,
  RecurringRenewalTenantSettings,
  TenantBookingWindow,
  TenantBusinessHoursAndLocale,
} from '../../application/ports/booking-platform.port';

@Injectable()
export class BookingPlatformAdapter implements IBookingPlatformPort {
  private readonly logger = new AppLogger(BookingPlatformAdapter.name);

  constructor(
    private readonly getTenantById: GetTenantByIdUseCase,
    private readonly getTenantBusinessHoursForUpdate: GetTenantBusinessHoursForUpdateUseCase,
    private readonly getHotsiteBookingPicker: GetHotsiteBookingPickerUseCase,
    @Inject(FRONTEND_REVALIDATION_PORT)
    private readonly frontendRevalidation: IFrontendRevalidationPort,
    @Inject(TENANT_ACCESS_PORT) private readonly tenantAccess: TenantAccessPort,
  ) {}

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

  async getServiceBufferMinutes(tenantId: string): Promise<number> {
    const tenant = await this.getTenantById.execute({ tenantId });
    return tenant.settings.booking.serviceBufferMinutes;
  }

  async getTenantBookingWindow(tenantId: string): Promise<TenantBookingWindow> {
    const tenant = await this.getTenantById.execute({ tenantId });
    const { minBookingAdvanceHours, maxBookingAdvanceDays } = tenant.settings.booking;
    return {
      minBookingAdvanceHours,
      maxBookingAdvanceDays,
      bookableUntil: await this.readBookableUntil(tenantId),
      timezone: tenant.settings.businessHours.timezone,
    };
  }

  // The cached cap, for DISPLAY clamps only (M26-S18b). A failed lookup shows the unclamped window:
  // the write paths read the authoritative cap themselves and never fail open.
  private async readBookableUntil(tenantId: string): Promise<string | null> {
    try {
      return (await this.tenantAccess.getAccess(tenantId)).bookableUntil ?? null;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'unknown error';
      this.logger.warn(`Bookable-until display clamp skipped for tenant '${tenantId}': ${message}`);
      return null;
    }
  }

  async getRecurringRenewalSettings(tenantId: string): Promise<RecurringRenewalTenantSettings> {
    const tenant = await this.getTenantById.execute({ tenantId });
    return {
      timezone: tenant.settings.businessHours.timezone,
      reminderDays: tenant.settings.booking.recurringRenewalReminderDays,
    };
  }

  async getAvailabilityAlertContext(tenantId: string): Promise<AvailabilityAlertTenantContext> {
    const [tenant, picker, bookableUntil] = await Promise.all([
      this.getTenantById.execute({ tenantId }),
      this.getHotsiteBookingPicker.execute({ tenantId }),
      this.readBookableUntil(tenantId),
    ]);
    const { booking, businessHours } = tenant.settings;
    const selectableDays =
      picker.datePickerType === 'calendar'
        ? booking.maxBookingAdvanceDays
        : Math.min(picker.carouselDays, booking.maxBookingAdvanceDays);
    return {
      businessHours,
      slotGranularityMinutes: booking.slotGranularityMinutes,
      serviceBufferMinutes: booking.serviceBufferMinutes,
      // The billing cap (M26-S18b) stops the matching at the effective date, like the pickers.
      selectableDays: clampAdvanceDaysToBookableUntil(
        selectableDays,
        bookableUntil,
        businessHours.timezone,
      ),
      bookingWindow: {
        minBookingAdvanceHours: booking.minBookingAdvanceHours,
        maxBookingAdvanceDays: booking.maxBookingAdvanceDays,
        bookableUntil,
        timezone: businessHours.timezone,
      },
    };
  }
}
