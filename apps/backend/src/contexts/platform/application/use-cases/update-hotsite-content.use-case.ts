import { Inject, Injectable } from '@nestjs/common';
import {
  ITransactionManager,
  TRANSACTION_MANAGER,
} from '../../../../shared/ports/transaction-manager.port';
import { IStorageService, STORAGE_SERVICE } from '../../../../shared/ports/storage.service.port';
import {
  HotsiteNotFoundError,
  TenantNotFoundError,
} from '../../domain/errors/platform-domain.error';
import {
  HotsiteBranding,
  HotsiteConfig,
  HotsiteModule,
  HotsiteModuleData,
  HotsiteSeo,
} from '../../domain/hotsite-config.aggregate';
import { HotsiteImagePathsService } from '../../domain/services/hotsite-image-paths.service';
import { HotsiteImageUrlResolver } from '../../domain/services/hotsite-image-url-resolver.service';
import { HotsiteImagePromotionService } from '../services/hotsite-image-promotion.service';
import {
  HOTSITE_CONFIG_REPOSITORY,
  IHotsiteConfigRepository,
} from '../ports/hotsite-config-repository.port';
import { ITenantRepository, TENANT_REPOSITORY } from '../ports/tenant-repository.port';
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
    @Inject(TENANT_REPOSITORY) private readonly tenantRepo: ITenantRepository,
    @Inject(TRANSACTION_MANAGER) private readonly txManager: ITransactionManager,
    private readonly imagePathsService: HotsiteImagePathsService,
    private readonly imagePromotionService: HotsiteImagePromotionService,
    private readonly imageUrlResolver: HotsiteImageUrlResolver,
    @Inject(STORAGE_SERVICE) private readonly storageService: IStorageService,
  ) {}

  async execute(dto: UpdateHotsiteContentUseCaseInput): Promise<UpdateHotsiteContentUseCaseResult> {
    const { tenantId } = dto;
    const config = await this.hotsiteConfigRepo.findByTenantId(tenantId);
    if (!config) throw new HotsiteNotFoundError(tenantId);

    // Captured before the merge — needed to detect "was this field pointing at a permanent
    // object that the merged value no longer references" (delete-previous-on-replace).
    const oldPaths = this.imagePathsService.collect(config.branding, config.layout, config.seo);
    const merged = this.mergeContent(config, dto);

    const { branding, layout, seo, promotions } =
      await this.imagePromotionService.prepareImagePromotion(
        merged.branding,
        merged.layout,
        merged.seo,
        tenantId,
      );

    const deletions = this.imagePromotionService.computeDeletions(
      oldPaths,
      branding,
      layout,
      seo,
      tenantId,
    );

    await this.txManager.run(async () => {
      // Locked and re-read here, not before the transaction — carouselDays vs.
      // maxBookingAdvanceDays is a cross-aggregate invariant (Tenant vs. HotsiteConfig). Reading
      // the tenant's settings before opening the transaction would validate against a value that
      // a concurrent settings update could change before this save actually commits.
      // findByIdForUpdate's row lock serializes against that update instead of racing it.
      const tenant = await this.tenantRepo.findByIdForUpdate(tenantId);
      if (!tenant) throw new TenantNotFoundError(tenantId);

      config.updateContent(branding, layout, seo, {
        maxBookingAdvanceDays: tenant.settings.booking.maxBookingAdvanceDays,
      });

      await this.hotsiteConfigRepo.save(config);
      await this.txManager.scheduleAfterCommit(() =>
        this.imagePromotionService.executeImagePromotion(promotions, deletions),
      );
    });

    return this.buildResult(config);
  }

  // Symmetric with GetHotsiteContentUseCase/HotsiteContentReader.readResolved: stored fields
  // are raw storage paths, not displayable URLs. Without this, the frontend receives a raw
  // path here (unlike the resolved URL it gets from GET) and falls back to reconstructing one
  // client-side — a reconstruction that only happens to match `getPublicUrl()`'s real
  // `base/bucket/path` shape when the environment's public base URL bakes the bucket name in,
  // which local dev's `.env` does but staging's Terraform-provisioned base URL deliberately
  // does not (host-only, to allow a future custom-domain/CDN swap) — so the reopened editor
  // silently shows a broken image after any Publish in staging/prod.
  private buildResult(config: HotsiteConfig): UpdateHotsiteContentUseCaseResult {
    const resolved = this.imageUrlResolver.resolve(
      config.branding,
      config.layout,
      config.seo,
      (storagePath) => this.storageService.getPublicUrl(storagePath),
    );

    return {
      branding: resolved.branding,
      layout: resolved.layout,
      seo: resolved.seo,
      isPublished: config.isPublished,
    };
  }

  private mergeContent(
    config: HotsiteConfig,
    dto: UpdateHotsiteContentUseCaseInput,
  ): { branding: HotsiteBranding; layout: HotsiteModule[]; seo: HotsiteSeo } {
    return {
      branding: dto.branding ? { ...config.branding, ...dto.branding } : config.branding,
      layout: dto.layout ? this.toDomainLayout(dto.layout) : config.layout,
      seo: dto.seo ? { ...config.seo, ...dto.seo } : config.seo,
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
