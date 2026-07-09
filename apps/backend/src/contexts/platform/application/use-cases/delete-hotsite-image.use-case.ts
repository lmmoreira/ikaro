import { Inject, Injectable } from '@nestjs/common';
import { IStorageService, STORAGE_SERVICE } from '../../../../shared/ports/storage.service.port';
import { extractTenantIdFromPath } from '../../../../shared/utils/extract-tenant-id-from-path';
import { extractTenantIdFromTmpPath } from '../../../../shared/utils/extract-tenant-id-from-tmp-path';
import { HotsiteImageNotUploadedError } from '../../domain/errors/platform-domain.error';
import { DeleteHotsiteImageDto } from '../dtos/delete-hotsite-image.dto';

export type DeleteHotsiteImageUseCaseInput = DeleteHotsiteImageDto & { tenantId: string };

@Injectable()
export class DeleteHotsiteImageUseCase {
  constructor(@Inject(STORAGE_SERVICE) private readonly storageService: IStorageService) {}

  async execute(dto: DeleteHotsiteImageUseCaseInput): Promise<void> {
    // A not-yet-applied/promoted upload still lives in tmp/ (private bucket) — "Remove" before
    // save must delete it there instead of the permanent public path (see
    // td/TD22-ORPHANED-UPLOAD-CLEANUP.md).
    if (dto.filePath.startsWith('tmp/')) {
      if (extractTenantIdFromTmpPath(dto.filePath) !== dto.tenantId) {
        throw new HotsiteImageNotUploadedError(dto.filePath);
      }
      await this.storageService.delete(dto.filePath, 'private');
      return;
    }

    const sourceTenantId = extractTenantIdFromPath(dto.filePath);
    if (sourceTenantId !== dto.tenantId) {
      throw new HotsiteImageNotUploadedError(dto.filePath);
    }

    await this.storageService.delete(dto.filePath, 'public');
  }
}
