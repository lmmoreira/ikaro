import { Inject, Injectable } from '@nestjs/common';
import { IStorageService, STORAGE_SERVICE } from '../../../../shared/ports/storage.service.port';
import { TenantContext } from '../../../../shared/tenant/tenant-context';
import {
  HotsiteNotFoundError,
  TenantNotFoundError,
} from '../../domain/errors/platform-domain.error';
import { HotsiteBranding, HotsiteModule, HotsiteSeo } from '../../domain/hotsite-config.aggregate';
import { HotsiteImageUrlResolver } from '../../domain/services/hotsite-image-url-resolver.service';
import { BusinessInfo } from '../../domain/value-objects/tenant-settings.vo';
import {
  HOTSITE_CONFIG_REPOSITORY,
  IHotsiteConfigRepository,
} from '../ports/hotsite-config-repository.port';
import { ITenantRepository, TENANT_REPOSITORY } from '../ports/tenant-repository.port';

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
  lookupService: 'viacep' | 'none';
}

export interface HotsiteLocalization {
  language: string;
  currency: string;
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
    @Inject(HOTSITE_CONFIG_REPOSITORY)
    private readonly hotsiteConfigRepo: IHotsiteConfigRepository,
    @Inject(TENANT_REPOSITORY) private readonly tenantRepo: ITenantRepository,
    @Inject(STORAGE_SERVICE) private readonly storageService: IStorageService,
    private readonly tenantContext: TenantContext,
    private readonly imageUrlResolver: HotsiteImageUrlResolver,
  ) {}

  async execute(): Promise<GetHotsiteManifestUseCaseResult> {
    const tenantId = this.tenantContext.tenantId;
    const config = await this.hotsiteConfigRepo.findByTenantId(tenantId);
    if (!config) throw new HotsiteNotFoundError(tenantId);

    const tenant = await this.tenantRepo.findById(tenantId);
    if (!tenant) throw new TenantNotFoundError(tenantId);

    if (!config.isPublished) {
      const { branding } = this.imageUrlResolver.resolve(config.branding, [], (storagePath) =>
        this.storageService.getPublicUrl(storagePath),
      );
      return {
        branding,
        layout: [],
        seo: config.seo,
        isPublished: false,
        business: emptyBusinessInfo(),
        localization: this.mapLocalization(tenant.settings.resolveLocalization()),
      };
    }

    const { branding, layout } = this.imageUrlResolver.resolve(
      config.branding,
      config.layout,
      (storagePath) => this.storageService.getPublicUrl(storagePath),
    );

    return {
      branding,
      layout,
      seo: config.seo,
      isPublished: config.isPublished,
      business: this.mapBusinessInfo(tenant.settings.business_info),
      localization: this.mapLocalization(tenant.settings.resolveLocalization()),
    };
  }

  private mapLocalization(
    resolved: import('../../domain/value-objects/tenant-settings.vo').ResolvedLocalization,
  ): HotsiteLocalization {
    return {
      language: resolved.language,
      currency: resolved.currency,
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
            zipCode: businessInfo.address.zip_code,
          }
        : null,
      socialLinks: businessInfo.social_links
        ? {
            whatsapp: businessInfo.social_links.whatsapp,
            instagram: businessInfo.social_links.instagram,
            facebook: businessInfo.social_links.facebook,
          }
        : null,
    };
  }
}
