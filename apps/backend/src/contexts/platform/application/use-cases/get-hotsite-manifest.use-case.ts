import { Inject, Injectable } from '@nestjs/common';
import { IStorageService, STORAGE_SERVICE } from '../../../../shared/ports/storage.service.port';
import { TenantContext } from '../../../../shared/tenant/tenant-context';
import {
  HotsiteNotFoundError,
  TenantNotFoundError,
} from '../../domain/errors/platform-domain.error';
import { HotsiteBranding, HotsiteModule } from '../../domain/hotsite-config.aggregate';
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
  neighborhood: string;
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

export interface GetHotsiteManifestUseCaseResult {
  branding: HotsiteBranding;
  layout: HotsiteModule[];
  isPublished: boolean;
  business: HotsiteBusinessInfo;
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

    if (!config.isPublished) {
      const { branding } = this.imageUrlResolver.resolve(config.branding, [], (storagePath) =>
        this.storageService.getPublicUrl(storagePath),
      );
      return { branding, layout: [], isPublished: false, business: emptyBusinessInfo() };
    }

    const tenant = await this.tenantRepo.findById(tenantId);
    if (!tenant) throw new TenantNotFoundError(tenantId);

    const { branding, layout } = this.imageUrlResolver.resolve(
      config.branding,
      config.layout,
      (storagePath) => this.storageService.getPublicUrl(storagePath),
    );

    return {
      branding,
      layout,
      isPublished: config.isPublished,
      business: this.mapBusinessInfo(tenant.settings.business_info),
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
            neighborhood: businessInfo.address.neighborhood,
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
