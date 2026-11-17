import { Inject, Injectable } from '@nestjs/common';
import { HOTSITE_MODULE_FEATURE, type FeatureKey } from '@ikaro/types';
import { AppLogger } from '../../../../shared/observability/app-logger';
import {
  TENANT_ACCESS_PORT,
  type TenantAccess,
  type TenantAccessPort,
} from '../../../../shared/ports/tenant-access.port';
import { TenantNotFoundError } from '../../domain/errors/platform-domain.error';
import { HotsiteBranding, HotsiteModule, HotsiteSeo } from '../../domain/hotsite-config.aggregate';
import { BookingSettings, BusinessInfo } from '../../domain/value-objects/tenant-settings.vo';
import { ITenantRepository, TENANT_REPOSITORY } from '../ports/tenant-repository.port';
import { HotsiteContentReader } from '../services/hotsite-content-reader.service';

export interface HotsiteBusinessInfoAddress {
  street: string;
  number: string;
  complement?: string;
  neighborhood?: string;
  city: string;
  state: string;
  zipCode: string;
}

export interface HotsiteBusinessInfoSocialLinks {
  whatsapp: string | null;
  instagram: string | null;
  facebook: string | null;
}

export interface HotsiteBusinessInfo {
  phone: string | null;
  email: string | null;
  address: HotsiteBusinessInfoAddress | null;
  socialLinks: HotsiteBusinessInfoSocialLinks | null;
}

export interface HotsiteAddressSpec {
  postalLabel: string;
  postalPlaceholder: string;
  stateLabel: string;
  requireNeighborhood: boolean;
  neighborhoodLabel: string | null;
  streetLabel: string;
  numberLabel: string;
  complementLabel: string;
  cityLabel: string;
  lookupService: 'viacep' | 'none';
}

export interface HotsiteLocalization {
  language: string;
  currency: string;
  timezone: string;
  phonePrefix: string;
  dateFormat: string;
  timeFormat: '24h' | '12h';
  numberFormat: string;
  firstDayOfWeek: 0 | 1;
  address: HotsiteAddressSpec;
}

export interface HotsiteBookingSettings {
  maxBookingAdvanceDays: number;
}

export interface GetHotsiteManifestUseCaseInput {
  tenantId: string;
}

export interface GetHotsiteManifestUseCaseResult {
  branding: HotsiteBranding;
  layout: HotsiteModule[];
  seo: HotsiteSeo;
  isPublished: boolean;
  business: HotsiteBusinessInfo;
  localization: HotsiteLocalization;
  booking: HotsiteBookingSettings;
  /** The features the hotsite has a surface for that the tenant does not hold; `[]` fails open. */
  unavailableFeatures: FeatureKey[];
}

function emptyBusinessInfo(): HotsiteBusinessInfo {
  return {
    phone: null,
    email: null,
    address: null,
    socialLinks: null,
  };
}

@Injectable()
export class GetHotsiteManifestUseCase {
  private readonly logger = new AppLogger(GetHotsiteManifestUseCase.name);

  constructor(
    @Inject(TENANT_REPOSITORY) private readonly tenantRepo: ITenantRepository,
    private readonly hotsiteContentReader: HotsiteContentReader,
    @Inject(TENANT_ACCESS_PORT) private readonly tenantAccess: TenantAccessPort,
  ) {}

  async execute({
    tenantId,
  }: GetHotsiteManifestUseCaseInput): Promise<GetHotsiteManifestUseCaseResult> {
    const content = await this.hotsiteContentReader.readResolved(tenantId);

    const tenant = await this.tenantRepo.findById(tenantId);
    if (!tenant) throw new TenantNotFoundError(tenantId);

    // Billing never mutates the manager's flag: a suspended tenant simply reads as unpublished.
    const access = await this.readAccess(tenantId);
    const isPublished = content.isPublished && (access?.operational ?? true);

    if (!isPublished) {
      return {
        branding: content.branding,
        layout: [],
        seo: content.seo,
        isPublished: false,
        business: emptyBusinessInfo(),
        localization: this.mapLocalization(
          tenant.settings.resolveLocalization(),
          tenant.settings.businessHours.timezone,
        ),
        booking: this.mapBookingSettings(tenant.settings.booking),
        unavailableFeatures: this.unavailableFeatures(access),
      };
    }

    return {
      branding: content.branding,
      layout: this.filterEntitledModules(content.layout, access),
      seo: content.seo,
      isPublished,
      business: this.mapBusinessInfo(tenant.settings.businessInfo),
      localization: this.mapLocalization(
        tenant.settings.resolveLocalization(),
        tenant.settings.businessHours.timezone,
      ),
      booking: this.mapBookingSettings(tenant.settings.booking),
      unavailableFeatures: this.unavailableFeatures(access),
    };
  }

  // A failed lookup fails open: the page renders as it did before Billing existed.
  private async readAccess(tenantId: string): Promise<TenantAccess | null> {
    try {
      return await this.tenantAccess.getAccess(tenantId);
    } catch (err) {
      this.logger.warn('Tenant access lookup failed; serving the hotsite as published', {
        tenantId,
        error: err instanceof Error ? err.message : String(err),
      });
      return null;
    }
  }

  // Omits (never deletes) a module whose feature the tenant lacks: its stored settings stay in
  // the config and the module returns once the entitlement does.
  private filterEntitledModules(
    layout: HotsiteModule[],
    access: TenantAccess | null,
  ): HotsiteModule[] {
    if (!access) return layout;
    return layout.filter((module) => {
      const feature = HOTSITE_MODULE_FEATURE[module.type];
      return !feature || access.features.some((entitled) => entitled.key === feature);
    });
  }

  private mapLocalization(
    resolved: import('../../domain/value-objects/tenant-settings.vo').ResolvedLocalization,
    timezone: string,
  ): HotsiteLocalization {
    return {
      language: resolved.language,
      currency: resolved.currency,
      timezone,
      phonePrefix: resolved.phonePrefix,
      dateFormat: resolved.dateFormat,
      timeFormat: resolved.timeFormat,
      numberFormat: resolved.numberFormat,
      firstDayOfWeek: resolved.firstDayOfWeek,
      address: {
        postalLabel: resolved.address.postalLabel,
        postalPlaceholder: resolved.address.postalPlaceholder,
        stateLabel: resolved.address.stateLabel,
        requireNeighborhood: resolved.address.requireNeighborhood,
        neighborhoodLabel: resolved.address.neighborhoodLabel,
        streetLabel: resolved.address.streetLabel,
        numberLabel: resolved.address.numberLabel,
        complementLabel: resolved.address.complementLabel,
        cityLabel: resolved.address.cityLabel,
        lookupService: resolved.address.lookupService,
      },
    };
  }

  // The features that gate a hotsite surface (the values of `HOTSITE_MODULE_FEATURE`) the tenant does
  // not hold, so the web can hide the links and pages that depend on them without knowing any one
  // feature. Nothing else about the tenant's plan is published.
  private unavailableFeatures(access: TenantAccess | null): FeatureKey[] {
    if (!access) return [];
    const gating = new Set(Object.values(HOTSITE_MODULE_FEATURE));
    return [...gating].filter((feature) => !access.features.some((held) => held.key === feature));
  }

  private mapBookingSettings(booking: BookingSettings): HotsiteBookingSettings {
    return {
      maxBookingAdvanceDays: booking.maxBookingAdvanceDays,
    };
  }

  private mapBusinessInfo(businessInfo: BusinessInfo): HotsiteBusinessInfo {
    return {
      phone: businessInfo.phone,
      email: businessInfo.email,
      address: businessInfo.address
        ? {
            street: businessInfo.address.street,
            number: businessInfo.address.number,
            complement: businessInfo.address.complement ?? undefined,
            neighborhood: businessInfo.address.neighborhood ?? undefined,
            city: businessInfo.address.city,
            state: businessInfo.address.state,
            zipCode: businessInfo.address.zipCode,
          }
        : null,
      socialLinks: businessInfo.socialLinks
        ? {
            whatsapp: businessInfo.socialLinks.whatsapp,
            instagram: businessInfo.socialLinks.instagram,
            facebook: businessInfo.socialLinks.facebook,
          }
        : null,
    };
  }
}
