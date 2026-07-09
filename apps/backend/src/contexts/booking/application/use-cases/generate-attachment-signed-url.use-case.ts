import { Inject, Injectable } from '@nestjs/common';
import { uuidv7 } from '../../../../shared/domain/uuid-v7';
import { IStorageService, STORAGE_SERVICE } from '../../../../shared/ports/storage.service.port';
import { GenerateAttachmentSignedUrlDto } from '../dtos/generate-attachment-signed-url.dto';

export type GenerateAttachmentSignedUrlInput = GenerateAttachmentSignedUrlDto & {
  tenantId: string;
};

export interface GenerateAttachmentSignedUrlUseCaseResult {
  signedUrl: string;
  filePath: string;
  expiresAt: string;
}

@Injectable()
export class GenerateAttachmentSignedUrlUseCase {
  constructor(@Inject(STORAGE_SERVICE) private readonly storageService: IStorageService) {}

  async execute(
    input: GenerateAttachmentSignedUrlInput,
  ): Promise<GenerateAttachmentSignedUrlUseCaseResult> {
    const { tenantId } = input;

    // Staged in the private bucket under tmp/ — not booking-scoped until promotion (see
    // td/TD22-ORPHANED-UPLOAD-CLEANUP.md). bookingId is no longer needed at upload time since
    // the destination path is only known once the booking is actually persisted.
    const filePath = `tmp/${tenantId}/${uuidv7()}/${input.fileName}`;

    const { signedUrl, expiresAt } = await this.storageService.generateWriteSignedUrl(
      filePath,
      input.contentType,
    );

    return { signedUrl, filePath, expiresAt: expiresAt.toISOString() };
  }
}
