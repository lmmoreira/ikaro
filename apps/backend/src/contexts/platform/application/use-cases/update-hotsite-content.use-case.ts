import { Inject, Injectable } from '@nestjs/common';
import { IStorageService, STORAGE_SERVICE } from '../../../../shared/ports/storage.service.port';
import {
  ITransactionManager,
  TRANSACTION_MANAGER,
} from '../../../../shared/ports/transaction-manager.port';
import { TenantContext } from '../../../../shared/tenant/tenant-context';
import {
  HotsiteImageNotUploadedError,
  HotsiteNotFoundError,
} from '../../domain/errors/platform-domain.error';
import {
  HotsiteBranding,
  HotsiteModule,
  HotsiteModuleData,
  HotsiteSeo,
} from '../../domain/hotsite-config.aggregate';
import { HotsiteImagePathsService } from '../../domain/services/hotsite-image-paths.service';
import {
  HOTSITE_CONFIG_REPOSITORY,
  IHotsiteConfigRepository,
} from '../ports/hotsite-config-repository.port';
import { UpdateHotsiteContentDto } from '../dtos/update-hotsite-content.dto';

export interface UpdateHotsiteContentUseCaseResult {
  branding: HotsiteBranding;
  layout: HotsiteModule[];
  seo: HotsiteSeo;
  isPublished: boolean;
}

@Injectable()
export class UpdateHotsiteContentUseCase {
  constructor(
    @Inject(HOTSITE_CONFIG_REPOSITORY)
    private readonly hotsiteConfigRepo: IHotsiteConfigRepository,
    @Inject(STORAGE_SERVICE) private readonly storageService: IStorageService,
    @Inject(TRANSACTION_MANAGER) private readonly txManager: ITransactionManager,
    private readonly tenantContext: TenantContext,
    private readonly imagePathsService: HotsiteImagePathsService,
  ) {}

  async execute(dto: UpdateHotsiteContentDto): Promise<UpdateHotsiteContentUseCaseResult> {
    const tenantId = this.tenantContext.tenantId;
    const config = await this.hotsiteConfigRepo.findByTenantId(tenantId);
    if (!config) throw new HotsiteNotFoundError(tenantId);

    const branding: HotsiteBranding = dto.branding
      ? { ...config.branding, ...dto.branding }
      : config.branding;
    const layout: HotsiteModule[] = dto.layout ? this.toDomainLayout(dto.layout) : config.layout;
    const seo: HotsiteSeo = dto.seo ? { ...config.seo, ...dto.seo } : config.seo;

    await this.verifyImagesExist(branding, layout);

    config.updateContent(branding, layout, seo);

    await this.txManager.run(async () => {
      await this.hotsiteConfigRepo.save(config);
    });

    return {
      branding: config.branding,
      layout: config.layout,
      seo: config.seo,
      isPublished: config.isPublished,
    };
  }

  private async verifyImagesExist(
    branding: HotsiteBranding,
    layout: HotsiteModule[],
  ): Promise<void> {
    const tenantPrefix = `tenants/${this.tenantContext.tenantId}/`;
    for (const path of this.imagePathsService.collect(branding, layout)) {
      if (!path.startsWith(tenantPrefix)) throw new HotsiteImageNotUploadedError(path);
      const exists = await this.storageService.exists(path, 'public');
      if (!exists) throw new HotsiteImageNotUploadedError(path);
    }
  }

  private toDomainLayout(layout: UpdateHotsiteContentDto['layout']): HotsiteModule[] {
    return (layout ?? []).map((module) => ({
      type: module.type,
      enabled: module.enabled,
      // Zod validates `data` generically as a record — per-module-type shape
      // (HeroModuleData, GalleryModuleData, ...) is not statically derivable from it.
      data: module.data as HotsiteModuleData,
    }));
  }
}
