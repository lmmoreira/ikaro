import { Inject, Injectable } from '@nestjs/common';
import {
  ITransactionManager,
  TRANSACTION_MANAGER,
} from '../../../../shared/ports/transaction-manager.port';
import { scheduleAfterCommit } from '../../../../shared/infrastructure/transaction-context';
import { HotsiteNotFoundError } from '../../domain/errors/platform-domain.error';
import {
  HotsiteBranding,
  HotsiteModule,
  HotsiteModuleData,
  HotsiteSeo,
} from '../../domain/hotsite-config.aggregate';
import { HotsiteImagePathsService } from '../../domain/services/hotsite-image-paths.service';
import { HotsiteImagePromotionService } from '../services/hotsite-image-promotion.service';
import {
  HOTSITE_CONFIG_REPOSITORY,
  IHotsiteConfigRepository,
} from '../ports/hotsite-config-repository.port';
import { UpdateHotsiteContentDto } from '../dtos/update-hotsite-content.dto';

export type UpdateHotsiteContentUseCaseInput = UpdateHotsiteContentDto & { tenantId: string };

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
    @Inject(TRANSACTION_MANAGER) private readonly txManager: ITransactionManager,
    private readonly imagePathsService: HotsiteImagePathsService,
    private readonly imagePromotionService: HotsiteImagePromotionService,
  ) {}

  async execute(dto: UpdateHotsiteContentUseCaseInput): Promise<UpdateHotsiteContentUseCaseResult> {
    const { tenantId } = dto;
    const config = await this.hotsiteConfigRepo.findByTenantId(tenantId);
    if (!config) throw new HotsiteNotFoundError(tenantId);

    // Captured before the merge — needed to detect "was this field pointing at a permanent
    // object that the merged value no longer references" (delete-previous-on-replace).
    const oldPaths = this.imagePathsService.collect(config.branding, config.layout);

    const mergedBranding: HotsiteBranding = dto.branding
      ? { ...config.branding, ...dto.branding }
      : config.branding;
    const mergedLayout: HotsiteModule[] = dto.layout
      ? this.toDomainLayout(dto.layout)
      : config.layout;
    const seo: HotsiteSeo = dto.seo ? { ...config.seo, ...dto.seo } : config.seo;

    const { branding, layout, promotions } = await this.imagePromotionService.prepareImagePromotion(
      mergedBranding,
      mergedLayout,
      tenantId,
    );

    const newPaths = this.imagePathsService.collect(branding, layout);
    const tenantPrefix = `tenants/${tenantId}/`;
    const deletions = oldPaths.filter(
      (path) => !newPaths.includes(path) && path.startsWith(tenantPrefix),
    );

    config.updateContent(branding, layout, seo);

    await this.txManager.run(async () => {
      await this.hotsiteConfigRepo.save(config);
      await scheduleAfterCommit(() =>
        this.imagePromotionService.executeImagePromotion(promotions, deletions),
      );
    });

    return {
      branding: config.branding,
      layout: config.layout,
      seo: config.seo,
      isPublished: config.isPublished,
    };
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
