import { Inject, Injectable } from '@nestjs/common';
import { IStorageService, STORAGE_SERVICE } from '../../../../shared/ports/storage.service.port';
import {
  ITransactionManager,
  TRANSACTION_MANAGER,
} from '../../../../shared/ports/transaction-manager.port';
import { scheduleAfterCommit } from '../../../../shared/infrastructure/transaction-context';
import { extractTenantIdFromTmpPath } from '../../../../shared/utils/extract-tenant-id-from-tmp-path';
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

export type UpdateHotsiteContentUseCaseInput = UpdateHotsiteContentDto & { tenantId: string };

export interface UpdateHotsiteContentUseCaseResult {
  branding: HotsiteBranding;
  layout: HotsiteModule[];
  seo: HotsiteSeo;
  isPublished: boolean;
}

interface ImagePromotionOperation {
  from: string;
  to: string;
}

@Injectable()
export class UpdateHotsiteContentUseCase {
  constructor(
    @Inject(HOTSITE_CONFIG_REPOSITORY)
    private readonly hotsiteConfigRepo: IHotsiteConfigRepository,
    @Inject(STORAGE_SERVICE) private readonly storageService: IStorageService,
    @Inject(TRANSACTION_MANAGER) private readonly txManager: ITransactionManager,
    private readonly imagePathsService: HotsiteImagePathsService,
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

    const { branding, layout, promotions } = await this.prepareImagePromotion(
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
      await scheduleAfterCommit(() => this.executeImagePromotion(promotions, deletions));
    });

    return {
      branding: config.branding,
      layout: config.layout,
      seo: config.seo,
      isPublished: config.isPublished,
    };
  }

  /**
   * Pure validation + path computation — call before the aggregate is mutated/saved. No storage
   * mutation happens here; the actual copy/delete is deferred to `executeImagePromotion`, called
   * via `scheduleAfterCommit()` only once the config is safely persisted (see
   * td/TD22-ORPHANED-UPLOAD-CLEANUP.md — `config.updateContent()`'s `validateBranding()` can still
   * throw after this step, so storage must not be mutated until the save actually succeeds).
   */
  private async prepareImagePromotion(
    branding: HotsiteBranding,
    layout: HotsiteModule[],
    tenantId: string,
  ): Promise<{
    branding: HotsiteBranding;
    layout: HotsiteModule[];
    promotions: ImagePromotionOperation[];
  }> {
    const tenantPrefix = `tenants/${tenantId}/`;
    const tmpPrefix = `tmp/${tenantId}/`;
    const rewriteMap = new Map<string, string>();
    const promotions: ImagePromotionOperation[] = [];

    for (const path of this.imagePathsService.collect(branding, layout)) {
      if (path.startsWith(tmpPrefix)) {
        if (extractTenantIdFromTmpPath(path) !== tenantId) {
          throw new HotsiteImageNotUploadedError(path);
        }
        const exists = await this.storageService.exists(path, 'private');
        if (!exists) throw new HotsiteImageNotUploadedError(path);

        const newPermanentPath = `tenants/${tenantId}/hotsite/${path.slice(tmpPrefix.length)}`;
        rewriteMap.set(path, newPermanentPath);
        promotions.push({ from: path, to: newPermanentPath });
        continue;
      }

      if (!path.startsWith(tenantPrefix)) throw new HotsiteImageNotUploadedError(path);
      const exists = await this.storageService.exists(path, 'public');
      if (!exists) throw new HotsiteImageNotUploadedError(path);
    }

    const rewritten =
      rewriteMap.size > 0
        ? this.imagePathsService.mapPaths(branding, layout, (path) => rewriteMap.get(path) ?? path)
        : { branding, layout };

    return { branding: rewritten.branding, layout: rewritten.layout, promotions };
  }

  /** Actual copy+delete — call via scheduleAfterCommit(), only after the config row is saved. Best-effort per file. */
  private async executeImagePromotion(
    promotions: ImagePromotionOperation[],
    deletions: string[],
  ): Promise<void> {
    for (const { from, to } of promotions) {
      try {
        await this.storageService.copy(from, to, 'public');
        await this.storageService.delete(from, 'private');
      } catch {
        // log and continue — the config already points at `to`; a failed copy just means that
        // path 404s until manually reconciled, not a broken save
      }
    }
    for (const path of deletions) {
      try {
        await this.storageService.delete(path, 'public');
      } catch {
        // best-effort — the reference is already gone from the config either way
      }
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
