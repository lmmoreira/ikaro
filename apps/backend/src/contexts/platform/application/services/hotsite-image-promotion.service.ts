import { Inject, Injectable } from '@nestjs/common';
import { IStorageService, STORAGE_SERVICE } from '../../../../shared/ports/storage.service.port';
import { extractTenantIdFromTmpPath } from '../../../../shared/utils/extract-tenant-id-from-tmp-path';
import { HotsiteImageNotUploadedError } from '../../domain/errors/platform-domain.error';
import { HotsiteBranding, HotsiteModule } from '../../domain/hotsite-config.aggregate';
import { HotsiteImagePathsService } from '../../domain/services/hotsite-image-paths.service';

export interface ImagePromotionOperation {
  from: string;
  to: string;
}

export interface PreparedImagePromotion {
  branding: HotsiteBranding;
  layout: HotsiteModule[];
  promotions: ImagePromotionOperation[];
}

@Injectable()
export class HotsiteImagePromotionService {
  constructor(
    @Inject(STORAGE_SERVICE) private readonly storageService: IStorageService,
    private readonly imagePathsService: HotsiteImagePathsService,
  ) {}

  /**
   * Pure validation + path computation — call before the aggregate is mutated/saved. No storage
   * mutation happens here; the actual copy/delete is deferred to `executeImagePromotion`, called
   * via `scheduleAfterCommit()` only once the config is safely persisted (see
   * td/TD22-ORPHANED-UPLOAD-CLEANUP.md — `config.updateContent()`'s `validateBranding()` can still
   * throw after this step, so storage must not be mutated until the save actually succeeds).
   */
  async prepareImagePromotion(
    branding: HotsiteBranding,
    layout: HotsiteModule[],
    tenantId: string,
  ): Promise<PreparedImagePromotion> {
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
  async executeImagePromotion(
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
}
