import { InMemoryFrontendRevalidationPort } from '../../../../test/infrastructure/in-memory-frontend-revalidation.port';
import { InMemoryHotsiteConfigRepository } from '../../../../test/repositories/platform/in-memory-hotsite-config.repository';
import { InMemoryTenantRepository } from '../../../../test/repositories/platform/in-memory-tenant.repository';
import {
  HotsiteConfigBuilder,
  TenantBuilder,
  TenantSettingsPropsBuilder,
} from '../../../../test/builders/platform/index';
import { TenantSettings } from '../../../platform/domain/value-objects/tenant-settings.vo';
import { HotsiteModule } from '../../../platform/domain/hotsite-config.aggregate';
import { GetHotsiteBookingPickerUseCase } from '../../../platform/application/use-cases/get-hotsite-booking-picker.use-case';
import { GetTenantByIdUseCase } from '../../../platform/application/use-cases/get-tenant-by-id.use-case';
import { GetTenantsUseCase } from '../../../platform/application/use-cases/get-tenants.use-case';
import { GetTenantBusinessHoursForUpdateUseCase } from '../../../platform/application/use-cases/get-tenant-business-hours-for-update.use-case';
import { BookingPlatformAdapter } from './booking-platform.adapter';

describe('BookingPlatformAdapter', () => {
  let repo: InMemoryTenantRepository;
  let hotsiteRepo: InMemoryHotsiteConfigRepository;
  let revalidation: InMemoryFrontendRevalidationPort;
  let adapter: BookingPlatformAdapter;

  beforeEach(() => {
    repo = new InMemoryTenantRepository();
    hotsiteRepo = new InMemoryHotsiteConfigRepository();
    revalidation = new InMemoryFrontendRevalidationPort();
    adapter = new BookingPlatformAdapter(
      new GetTenantsUseCase(repo),
      new GetTenantByIdUseCase(repo),
      new GetTenantBusinessHoursForUpdateUseCase(repo),
      new GetHotsiteBookingPickerUseCase(hotsiteRepo),
      revalidation,
    );
  });

  it('returns all active tenants with their timezones', async () => {
    const active = new TenantBuilder().build();
    await repo.save(active);

    const result = await adapter.findAllActive();

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(active.id);
    expect(result[0].timezone).toBe('America/Sao_Paulo');
  });

  it('returns an empty array when no tenants exist', async () => {
    const result = await adapter.findAllActive();
    expect(result).toEqual([]);
  });

  it('resolves independently for two different tenants', async () => {
    const tenantA = new TenantBuilder().withSlug('tenant-a').build();
    const tenantB = new TenantBuilder().withSlug('tenant-b').build();
    await repo.save(tenantA);
    await repo.save(tenantB);

    const result = await adapter.findAllActive();

    expect(result).toHaveLength(2);
    expect(result.map((t) => t.id)).toEqual(expect.arrayContaining([tenantA.id, tenantB.id]));
  });

  describe('revalidatePublicPages', () => {
    it("resolves the tenant's slug and calls revalidate with it", async () => {
      const tenant = new TenantBuilder().withSlug('lavacar-beloauto').build();
      await repo.save(tenant);

      await adapter.revalidatePublicPages(tenant.id);

      expect(revalidation.revalidatedSlugs).toEqual(['lavacar-beloauto']);
    });

    it('is best-effort — does not throw when the tenant does not exist, and skips revalidate', async () => {
      await expect(adapter.revalidatePublicPages('missing-tenant-id')).resolves.toBeUndefined();
      expect(revalidation.revalidatedSlugs).toEqual([]);
    });
  });

  describe('getBusinessHoursAndLocale', () => {
    it("returns the tenant's business hours and locale via GetTenantByIdUseCase", async () => {
      const tenant = new TenantBuilder().build();
      await repo.save(tenant);

      const result = await adapter.getBusinessHoursAndLocale(tenant.id);

      expect(result.locale).toBe('pt-BR');
      expect(result.businessHours).toEqual(tenant.settings.businessHours);
    });
  });

  describe('getBusinessHoursAndLocaleForUpdate', () => {
    it("returns the tenant's business hours and locale via the uncached, row-locking read", async () => {
      const tenant = new TenantBuilder().build();
      await repo.save(tenant);

      const result = await adapter.getBusinessHoursAndLocaleForUpdate(tenant.id);

      expect(result.locale).toBe('pt-BR');
      expect(result.businessHours).toEqual(tenant.settings.businessHours);
    });
  });

  describe('getAutoApproveEnabled', () => {
    it('returns settings.booking.autoApproveEnabled for the tenant', async () => {
      const tenant = new TenantBuilder()
        .withSettings(
          TenantSettings.create(
            new TenantSettingsPropsBuilder().withBooking({ autoApproveEnabled: true }).build(),
          ),
        )
        .build();
      await repo.save(tenant);

      const result = await adapter.getAutoApproveEnabled(tenant.id);

      expect(result).toBe(true);
    });
  });

  describe('getAvailabilityAlertContext', () => {
    async function seedTenant(maxBookingAdvanceDays: number) {
      const tenant = new TenantBuilder()
        .withSettings(
          TenantSettings.create(
            new TenantSettingsPropsBuilder().withBooking({ maxBookingAdvanceDays }).build(),
          ),
        )
        .build();
      await repo.save(tenant);
      return tenant;
    }

    // `picker` null = a hotsite with no BOOKING_CTA module at all.
    async function seedPicker(
      tenantId: string,
      picker: { datePickerType?: 'carousel' | 'calendar'; carouselDays?: number } | null,
      maxBookingAdvanceDays: number,
    ) {
      const layout: HotsiteModule[] = [
        {
          type: 'HERO',
          enabled: true,
          data: {
            variant: 'centered',
            title: 'Titulo',
            ctaLabel: 'Agendar',
            ctaTarget: 'booking-form',
          },
        },
      ];
      if (picker) {
        layout.push({
          type: 'BOOKING_CTA',
          enabled: true,
          data: { title: 'Agende já', ctaLabel: 'Agendar', ...picker },
        });
      }
      await hotsiteRepo.save(
        new HotsiteConfigBuilder()
          .withTenantId(tenantId)
          .withMaxBookingAdvanceDays(maxBookingAdvanceDays)
          .buildWithContent(undefined, layout),
      );
    }

    it('carousel mode: the selectable window is carouselDays, and the tenant availability inputs pass through', async () => {
      const tenant = await seedTenant(90);
      await seedPicker(tenant.id, { datePickerType: 'carousel', carouselDays: 14 }, 90);

      const result = await adapter.getAvailabilityAlertContext(tenant.id);

      expect(result.selectableDays).toBe(14);
      expect(result.businessHours).toEqual(tenant.settings.businessHours);
      expect(result.slotGranularityMinutes).toBe(tenant.settings.booking.slotGranularityMinutes);
      expect(result.serviceBufferMinutes).toBe(tenant.settings.booking.serviceBufferMinutes);
      expect(result.bookingWindow).toEqual({
        minBookingAdvanceHours: tenant.settings.booking.minBookingAdvanceHours,
        maxBookingAdvanceDays: 90,
      });
    });

    it('getTenantBookingWindow returns the tenant minimum notice and maximum advance', async () => {
      const tenant = await seedTenant(45);

      expect(await adapter.getTenantBookingWindow(tenant.id)).toEqual({
        minBookingAdvanceHours: tenant.settings.booking.minBookingAdvanceHours,
        maxBookingAdvanceDays: 45,
      });
    });

    it('calendar mode: the selectable window is maxBookingAdvanceDays, whatever carouselDays says', async () => {
      const tenant = await seedTenant(90);
      await seedPicker(tenant.id, { datePickerType: 'calendar', carouselDays: 14 }, 90);

      expect((await adapter.getAvailabilityAlertContext(tenant.id)).selectableDays).toBe(90);
    });

    it('carousel mode never exceeds maxBookingAdvanceDays', async () => {
      const tenant = await seedTenant(7);
      await seedPicker(tenant.id, { datePickerType: 'carousel', carouselDays: 7 }, 7);

      expect((await adapter.getAvailabilityAlertContext(tenant.id)).selectableDays).toBe(7);
    });

    it('falls back to a 14-day carousel when the BOOKING_CTA module sets no picker', async () => {
      const tenant = await seedTenant(90);
      await seedPicker(tenant.id, {}, 90);

      expect((await adapter.getAvailabilityAlertContext(tenant.id)).selectableDays).toBe(14);
    });

    it('falls back to a 14-day carousel when the hotsite has no BOOKING_CTA module', async () => {
      const tenant = await seedTenant(90);
      await seedPicker(tenant.id, null, 90);

      expect((await adapter.getAvailabilityAlertContext(tenant.id)).selectableDays).toBe(14);
    });

    it('falls back to a 14-day carousel when the tenant has no hotsite config at all', async () => {
      const tenant = await seedTenant(90);

      expect((await adapter.getAvailabilityAlertContext(tenant.id)).selectableDays).toBe(14);
    });

    it('caps the default carousel at a short maxBookingAdvanceDays', async () => {
      const tenant = await seedTenant(5);

      expect((await adapter.getAvailabilityAlertContext(tenant.id)).selectableDays).toBe(5);
    });

    it('tenant isolation: reads the picker of the requested tenant only', async () => {
      const tenantA = await seedTenant(90);
      const tenantB = new TenantBuilder().withSlug('tenant-b').build();
      await repo.save(tenantB);
      await seedPicker(tenantA.id, { datePickerType: 'calendar' }, 90);
      await seedPicker(tenantB.id, { datePickerType: 'carousel', carouselDays: 7 }, 90);

      expect((await adapter.getAvailabilityAlertContext(tenantA.id)).selectableDays).toBe(90);
      expect((await adapter.getAvailabilityAlertContext(tenantB.id)).selectableDays).toBe(7);
    });
  });
});
