import { Inject, Injectable, Logger } from '@nestjs/common';
import { IStorageService, STORAGE_SERVICE } from '../../../../shared/ports/storage.service.port';
import { extractTenantIdFromTmpPath } from '../../../../shared/utils/extract-tenant-id-from-tmp-path';
import { BookingPhotoNotUploadedError } from '../../domain/errors/booking-domain.error';

export interface PhotoPromotionOperation {
  from: string;
  to: string;
}

export interface PreparedPhotoPromotion {
  permanentPaths: string[];
  operations: PhotoPromotionOperation[];
}

@Injectable()
export class PhotoExistenceService {
  private readonly logger = new Logger(PhotoExistenceService.name);

  constructor(@Inject(STORAGE_SERVICE) private readonly storageService: IStorageService) {}

  /**
   * Pure validation + path computation — call before the aggregate is constructed/saved. No
   * storage mutation happens here; the actual copy/delete is deferred to `executePhotoPromotion`,
   * called via `scheduleAfterCommit()` only once the booking row is safely persisted.
   */
  async preparePhotoPromotion(
    tmpPaths: string[],
    tenantId: string,
    bookingId: string,
  ): Promise<PreparedPhotoPromotion> {
    const permanentPaths: string[] = [];
    const operations: PhotoPromotionOperation[] = [];
    for (const path of tmpPaths) {
      if (extractTenantIdFromTmpPath(path) !== tenantId) {
        throw new BookingPhotoNotUploadedError(path);
      }
      const exists = await this.storageService.exists(path, 'private');
      if (!exists) throw new BookingPhotoNotUploadedError(path);

      // Keep the tmp/ upload's uuid segment in the permanent path (tmp/<tenantId>/<uploadId>/
      // <fileName> -> tenants/<tenantId>/bookings/<bookingId>/<uploadId>/<fileName>) instead of
      // flattening to <fileName> alone — two uploads sharing an original filename (common with
      // phone-camera defaults like IMG_0001.jpg) would otherwise silently overwrite one another.
      const segments = path.split('/');
      const fileName = segments.pop()!;
      const uploadId = segments.pop()!;
      const permanentPath = `tenants/${tenantId}/bookings/${bookingId}/${uploadId}/${fileName}`;
      operations.push({ from: path, to: permanentPath });
      permanentPaths.push(permanentPath);
    }
    return { permanentPaths, operations };
  }

  /** Actual copy+delete — call via scheduleAfterCommit(), only after the booking row is saved. Best-effort per file. */
  async executePhotoPromotion(operations: PhotoPromotionOperation[]): Promise<void> {
    for (const { from, to } of operations) {
      try {
        await this.storageService.copy(from, to, 'private');
        await this.storageService.delete(from, 'private');
      } catch (err) {
        // Best-effort — the aggregate's photo fields already point at `to`; a failed copy just
        // means that path 404s until manually reconciled, not a broken booking record. Logged so
        // production failures are discoverable instead of silent.
        this.logger.error(
          `Failed to promote booking photo from ${from} to ${to}: ${(err as Error).message}`,
          (err as Error).stack,
        );
      }
    }
  }
}
