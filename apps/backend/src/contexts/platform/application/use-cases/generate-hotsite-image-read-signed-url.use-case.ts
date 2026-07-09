import { Inject, Injectable } from '@nestjs/common';
import { IStorageService, STORAGE_SERVICE } from '../../../../shared/ports/storage.service.port';
import { extractTenantIdFromTmpPath } from '../../../../shared/utils/extract-tenant-id-from-tmp-path';
import { HotsiteImageNotUploadedError } from '../../domain/errors/platform-domain.error';
import { GenerateHotsiteImageReadSignedUrlDto } from '../dtos/generate-hotsite-image-read-signed-url.dto';

export type GenerateHotsiteImageReadSignedUrlUseCaseInput = GenerateHotsiteImageReadSignedUrlDto & {
  tenantId: string;
};

export interface GenerateHotsiteImageReadSignedUrlUseCaseResult {
  signedUrl: string;
  expiresAt: string;
}

@Injectable()
export class GenerateHotsiteImageReadSignedUrlUseCase {
  constructor(@Inject(STORAGE_SERVICE) private readonly storageService: IStorageService) {}

  async execute(
    dto: GenerateHotsiteImageReadSignedUrlUseCaseInput,
  ): Promise<GenerateHotsiteImageReadSignedUrlUseCaseResult> {
    if (extractTenantIdFromTmpPath(dto.filePath) !== dto.tenantId) {
      throw new HotsiteImageNotUploadedError(dto.filePath);
    }

    const { signedUrl, expiresAt } = await this.storageService.generateReadSignedUrl(
      dto.filePath,
      'private',
    );

    return { signedUrl, expiresAt: expiresAt.toISOString() };
  }
}
