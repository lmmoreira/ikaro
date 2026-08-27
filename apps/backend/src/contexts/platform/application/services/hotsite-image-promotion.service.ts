import { Inject, Injectable } from '@nestjs/common';
import { IStorageService, STORAGE_SERVICE } from '../../../../shared/ports/storage.service.port';
import { extractTenantIdFromTmpPath } from '../../../../shared/utils/extract-tenant-id-from-tmp-path';
import { redactStoragePathForLogging } from '../../../../shared/utils/redact-storage-path-for-logging';
import { HOTSITE_TMP_PATH_REGEX } from '../../../../shared/utils/tmp-path-regex';
import { HotsiteImageNotUploadedError } from '../../domain/errors/platform-domain.error';
import { HotsiteBranding, HotsiteModule, HotsiteSeo } from '../../domain/hotsite-config.aggregate';
import { HotsiteImagePathsService } from '../../domain/services/hotsite-image-paths.service';
import { AppLogger } from '../../../../shared/observability/app-logger';

export interface ImagePromotionOperation {
  from: string;
  to: string;
}

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
   * td/TD22-ORPHANED-UPLOAD-CLEANUP.md — `config.updateContent()`'s `validateBranding()` can still
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

  private async checkAndPreparePath(
    path: string,
    tenantId: string,
  ): Promise<ImagePromotionOperation | null> {
    const tmpPrefix = `tmp/${tenantId}/`;
    if (path.startsWith(tmpPrefix)) {
      // Requires the hotsite-specific tmp/<tenantId>/<purpose>/<uuid>/<fileName> shape —
      // layout module image fields (data: Record<string, unknown> in the DTO) carry no shape
      // validation upstream, so this is the only gate standing between a same-tenant booking
      // tmp/ upload and being promoted into the public hotsite bucket (both shapes share the
      // tmp/<tenantId>/ prefix; only the extra purpose segment tells them apart).
      if (!HOTSITE_TMP_PATH_REGEX.test(path) || extractTenantIdFromTmpPath(path) !== tenantId) {
        throw new HotsiteImageNotUploadedError(path);
      }
      const exists = await this.storageService.exists(path, 'private');
      if (!exists) throw new HotsiteImageNotUploadedError(path);

      const newPermanentPath = `tenants/${tenantId}/hotsite/${path.slice(tmpPrefix.length)}`;
      return { from: path, to: newPermanentPath };
    }

    const tenantPrefix = `tenants/${tenantId}/`;
    if (!path.startsWith(tenantPrefix)) throw new HotsiteImageNotUploadedError(path);
    const exists = await this.storageService.exists(path, 'public');
    if (!exists) throw new HotsiteImageNotUploadedError(path);
    return null;
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
   * Best-effort per file: each operation catches its own error (never rethrows), so running them
   * concurrently is safe — there's no shared state and no ordering dependency between files.
   */
  async executeImagePromotion(
    promotions: ImagePromotionOperation[],
    deletions: string[],
  ): Promise<void> {
    await Promise.all(
      promotions.map(async ({ from, to }) => {
        try {
          await this.storageService.copy(from, to, 'public');
          await this.storageService.delete(from, 'private');
        } catch (err) {
          // Best-effort — the config already points at `to`; a failed copy just means that path
          // 404s until manually reconciled, not a broken save. Logged so production failures are
          // discoverable instead of silently leaving a broken image / orphaned tmp object.
          // Filenames are redacted — see redactStoragePathForLogging's doc comment.
          this.logger.error(
            `Failed to promote hotsite image from ${redactStoragePathForLogging(from)} to ${redactStoragePathForLogging(to)}: ${(err as Error).message}`,
            (err as Error).stack,
          );
        }
      }),
    );

    await Promise.all(
      deletions.map(async (path) => {
        try {
          await this.storageService.delete(path, 'public');
        } catch (err) {
          // Best-effort — the reference is already gone from the config either way.
          this.logger.error(
            `Failed to delete superseded hotsite image ${redactStoragePathForLogging(path)}: ${(err as Error).message}`,
            (err as Error).stack,
          );
        }
      }),
    );
  }
}
