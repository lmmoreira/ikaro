import { Inject, Injectable } from '@nestjs/common';
import { IStorageService, STORAGE_SERVICE } from '../../../../shared/ports/storage.service.port';
import { TenantContext } from '../../../../shared/tenant/tenant-context';
import {
  HotsiteNotFoundError,
  HotsiteNotPublishedError,
} from '../../domain/errors/platform-domain.error';
import { HotsiteBranding, HotsiteModule } from '../../domain/hotsite-config.aggregate';
import { HotsiteImageUrlResolver } from '../../domain/services/hotsite-image-url-resolver.service';
import {
  HOTSITE_CONFIG_REPOSITORY,
  IHotsiteConfigRepository,
} from '../ports/hotsite-config-repository.port';

export interface GetHotsiteManifestUseCaseResult {
  branding: HotsiteBranding;
  layout: HotsiteModule[];
  isPublished: boolean;
}

@Injectable()
export class GetHotsiteManifestUseCase {
  constructor(
    @Inject(HOTSITE_CONFIG_REPOSITORY)
    private readonly hotsiteConfigRepo: IHotsiteConfigRepository,
    @Inject(STORAGE_SERVICE) private readonly storageService: IStorageService,
    private readonly tenantContext: TenantContext,
    private readonly imageUrlResolver: HotsiteImageUrlResolver,
  ) {}

  async execute(): Promise<GetHotsiteManifestUseCaseResult> {
    const config = await this.hotsiteConfigRepo.findByTenantId(this.tenantContext.tenantId);
    if (!config) throw new HotsiteNotFoundError(this.tenantContext.tenantId);
    if (!config.isPublished) throw new HotsiteNotPublishedError(this.tenantContext.tenantId);

    const { branding, layout } = this.imageUrlResolver.resolve(
      config.branding,
      config.layout,
      (storagePath) => this.storageService.getPublicUrl(storagePath),
    );

    return { branding, layout, isPublished: config.isPublished };
  }
}
