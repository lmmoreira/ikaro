import { Inject, Injectable } from '@nestjs/common';
import { IStorageService, STORAGE_SERVICE } from '../../../../shared/ports/storage.service.port';
import { RequestContext } from '../../../../shared/request/request-context';
import { HotsiteNotFoundError } from '../../domain/errors/platform-domain.error';
import { HotsiteBranding, HotsiteModule, HotsiteSeo } from '../../domain/hotsite-config.aggregate';
import { HotsiteImageUrlResolver } from '../../domain/services/hotsite-image-url-resolver.service';
import {
  HOTSITE_CONFIG_REPOSITORY,
  IHotsiteConfigRepository,
} from '../ports/hotsite-config-repository.port';

export interface GetHotsiteContentUseCaseResult {
  branding: HotsiteBranding;
  layout: HotsiteModule[];
  seo: HotsiteSeo;
  isPublished: boolean;
  updatedAt: Date;
}

@Injectable()
export class GetHotsiteContentUseCase {
  constructor(
    @Inject(HOTSITE_CONFIG_REPOSITORY)
    private readonly hotsiteConfigRepo: IHotsiteConfigRepository,
    @Inject(STORAGE_SERVICE) private readonly storageService: IStorageService,
    private readonly tenantContext: RequestContext,
    private readonly imageUrlResolver: HotsiteImageUrlResolver,
  ) {}

  async execute(): Promise<GetHotsiteContentUseCaseResult> {
    const config = await this.hotsiteConfigRepo.findByTenantId(this.tenantContext.tenantId);
    if (!config) throw new HotsiteNotFoundError(this.tenantContext.tenantId);

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
      updatedAt: config.updatedAt,
    };
  }
}
