import { Inject, Injectable } from '@nestjs/common';
import { uuidv7 } from '../../../../shared/domain/uuid-v7';
import { IStorageService, STORAGE_SERVICE } from '../../../../shared/ports/storage.service.port';
import { TenantContext } from '../../../../shared/tenant/tenant-context';
import { GenerateHotsiteImageSignedUrlDto } from '../dtos/generate-hotsite-image-signed-url.dto';

export interface GenerateHotsiteImageSignedUrlUseCaseResult {
  signedUrl: string;
  filePath: string;
  expiresAt: string;
}

@Injectable()
export class GenerateHotsiteImageSignedUrlUseCase {
  constructor(
    private readonly tenantContext: TenantContext,
    @Inject(STORAGE_SERVICE) private readonly storageService: IStorageService,
  ) {}

  async execute(
    dto: GenerateHotsiteImageSignedUrlDto,
  ): Promise<GenerateHotsiteImageSignedUrlUseCaseResult> {
    const tenantId = this.tenantContext.tenantId;
    const filePath = `tenants/${tenantId}/hotsite/${dto.purpose}/${uuidv7()}/${dto.fileName}`;

    const { signedUrl, expiresAt } = await this.storageService.generateSignedUrl(
      filePath,
      dto.contentType,
      'write',
      'public',
    );

    return { signedUrl, filePath, expiresAt: expiresAt.toISOString() };
  }
}
