import { Inject, Injectable } from '@nestjs/common';
import { uuidv7 } from '../../../../shared/domain/uuid-v7';
import { IStorageService, STORAGE_SERVICE } from '../../../../shared/ports/storage.service.port';
import { GenerateHotsiteImageSignedUrlDto } from '../dtos/generate-hotsite-image-signed-url.dto';

export type GenerateHotsiteImageSignedUrlUseCaseInput = GenerateHotsiteImageSignedUrlDto & {
  tenantId: string;
};

export interface GenerateHotsiteImageSignedUrlUseCaseResult {
  signedUrl: string;
  filePath: string;
  expiresAt: string;
}

@Injectable()
export class GenerateHotsiteImageSignedUrlUseCase {
  constructor(@Inject(STORAGE_SERVICE) private readonly storageService: IStorageService) {}

  async execute(
    dto: GenerateHotsiteImageSignedUrlUseCaseInput,
  ): Promise<GenerateHotsiteImageSignedUrlUseCaseResult> {
    // Staged in the private bucket under tmp/ — not public/permanent until UpdateHotsiteContentUseCase
    // promotes it on save (see td/TD22-ORPHANED-UPLOAD-CLEANUP.md). Purpose is encoded into the tmp
    // path so promotion can rebuild the permanent tenants/<id>/hotsite/<purpose>/... path without
    // needing a second lookup.
    const filePath = `tmp/${dto.tenantId}/${dto.purpose}/${uuidv7()}/${dto.fileName}`;

    const { signedUrl, expiresAt } = await this.storageService.generateWriteSignedUrl(
      filePath,
      dto.contentType,
      'private',
    );

    return { signedUrl, filePath, expiresAt: expiresAt.toISOString() };
  }
}
