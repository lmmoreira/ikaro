import { Inject, Injectable } from '@nestjs/common';
import { IStorageService, STORAGE_SERVICE } from '../../../../shared/ports/storage.service.port';
import {
  executeTenantImagePromotion,
  ImagePromotionOperation,
  prepareTenantImagePromotion,
} from '../../../../shared/utils/tenant-image-promotion';
import { HotsiteImageNotUploadedError } from '../../domain/errors/platform-domain.error';
import { HotsiteBranding, HotsiteModule, HotsiteSeo } from '../../domain/hotsite-config.aggregate';
import { HotsiteImagePathsService } from '../../domain/services/hotsite-image-paths.service';
import { AppLogger } from '../../../../shared/observability/app-logger';

export type { ImagePromotionOperation };

export interface PreparedImagePromotion {
  branding: HotsiteBranding;
  layout: HotsiteModule[];
  seo: HotsiteSeo;
  promotions: ImagePromotionOperation[];
}

@Injectable()
export class HotsiteImagePromotionService {
  private readonly logger = new AppLogger(HotsiteImagePromotionService.name);

  constructor(
    @Inject(STORAGE_SERVICE) private readonly storageService: IStorageService,
    private readonly imagePathsService: HotsiteImagePathsService,
  ) {}

  /**
   * Pure validation + path computation — call before the aggregate is mutated/saved. No storage
   * mutation happens here; the actual copy/delete is deferred to `executeImagePromotion`, called
   * via `scheduleAfterCommit()` only once the config is safely persisted (see
   * docs/API_CONTRACTS.md — `config.updateContent()`'s `validateBranding()` can still
   * throw after this step, so storage must not be mutated until the save actually succeeds).
   */
  async prepareImagePromotion(
    branding: HotsiteBranding,
    layout: HotsiteModule[],
    seo: HotsiteSeo,
    tenantId: string,
  ): Promise<PreparedImagePromotion> {
    const results = await Promise.all(
      // Existence checks are independent per path (no shared mutable state, no early-exit
      // dependency between them) — run them concurrently rather than one round-trip at a time.
      // A tenant with many gallery/testimonial images no longer pays for each one sequentially.
      this.imagePathsService
        .collect(branding, layout, seo)
        .map((path) => this.checkAndPreparePath(path, tenantId)),
    );

    const promotions = results.filter(
      (result): result is ImagePromotionOperation => result !== null,
    );
    const rewriteMap = new Map(promotions.map(({ from, to }) => [from, to]));

    const rewritten =
      rewriteMap.size > 0
        ? this.imagePathsService.mapPaths(
            branding,
            layout,
            seo,
            (path) => rewriteMap.get(path) ?? path,
          )
        : { branding, layout, seo };

    return {
      branding: rewritten.branding,
      layout: rewritten.layout,
      seo: rewritten.seo,
      promotions,
    };
  }

  // The tmp/permanent path rules live in shared/utils/tenant-image-promotion.ts (the Booking service
  // public page uses the same ones); a hotsite image may sit anywhere under the tenant's own prefix.
  private checkAndPreparePath(
    path: string,
    tenantId: string,
  ): Promise<ImagePromotionOperation | null> {
    return prepareTenantImagePromotion(this.storageService, path, tenantId, {
      permanentPrefix: `tenants/${tenantId}/`,
      invalidPathError: (invalidPath) => new HotsiteImageNotUploadedError(invalidPath),
    });
  }

  /**
   * A `tenants/<tenantId>/...` path present before the write but absent from the new state is a
   * now-superseded permanent object — safe to delete. Never touches paths outside this tenant's
   * own prefix (e.g. a shared/default asset). UpdateHotsiteContentUseCase's own image-promotion
   * step is the sole caller — also covers the LEAD_FORM module's own teaser image, folded into
   * that same use case at M20-S08 (previously a separate UpdateLeadFormModuleUseCase call site).
   */
  computeDeletions(
    oldPaths: string[],
    branding: HotsiteBranding,
    layout: HotsiteModule[],
    seo: HotsiteSeo,
    tenantId: string,
  ): string[] {
    const newPaths = this.imagePathsService.collect(branding, layout, seo);
    const tenantPrefix = `tenants/${tenantId}/`;
    return oldPaths.filter((path) => !newPaths.includes(path) && path.startsWith(tenantPrefix));
  }

  /**
   * Actual copy+delete — call via scheduleAfterCommit(), only after the config row is saved.
   * Best-effort per file (see executeTenantImagePromotion).
   */
  executeImagePromotion(promotions: ImagePromotionOperation[], deletions: string[]): Promise<void> {
    return executeTenantImagePromotion(this.storageService, this.logger, promotions, deletions);
  }
}
