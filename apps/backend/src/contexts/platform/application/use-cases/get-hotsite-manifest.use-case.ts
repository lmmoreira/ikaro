import { Inject, Injectable } from '@nestjs/common';
import { RequestContext } from '../../../../shared/request/request-context';
import { TenantNotFoundError } from '../../domain/errors/platform-domain.error';
import { HotsiteBranding, HotsiteModule, HotsiteSeo } from '../../domain/hotsite-config.aggregate';
import { BusinessInfo } from '../../domain/value-objects/tenant-settings.vo';
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

export interface GetHotsiteManifestUseCaseResult {
  branding: HotsiteBranding;
  layout: HotsiteModule[];
  seo: HotsiteSeo;
  isPublished: boolean;
  business: HotsiteBusinessInfo;
  localization: HotsiteLocalization;
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
  constructor(
    @Inject(TENANT_REPOSITORY) private readonly tenantRepo: ITenantRepository,
    private readonly tenantContext: RequestContext,
    private readonly hotsiteContentReader: HotsiteContentReader,
  ) {}

  async execute(): Promise<GetHotsiteManifestUseCaseResult> {
    const tenantId = this.tenantContext.tenantId;
    const content = await this.hotsiteContentReader.readResolved(tenantId);

    const tenant = await this.tenantRepo.findById(tenantId);
    if (!tenant) throw new TenantNotFoundError(tenantId);

    if (!content.isPublished) {
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
      };
    }

    return {
      branding: content.branding,
      layout: content.layout,
      seo: content.seo,
      isPublished: content.isPublished,
      business: this.mapBusinessInfo(tenant.settings.businessInfo),
      localization: this.mapLocalization(
        tenant.settings.resolveLocalization(),
        tenant.settings.businessHours.timezone,
      ),
    };
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
