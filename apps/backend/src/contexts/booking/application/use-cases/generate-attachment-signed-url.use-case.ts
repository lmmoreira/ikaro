import { Inject, Injectable } from '@nestjs/common';
import { uuidv7 } from '../../../../shared/domain/uuid-v7';
import { IStorageService, STORAGE_SERVICE } from '../../../../shared/ports/storage.service.port';
import { BookingNotFoundError } from '../../domain/errors/booking-domain.error';
import { IBookingRepository, BOOKING_REPOSITORY } from '../ports/booking-repository.port';
import { GenerateAttachmentSignedUrlDto } from '../dtos/generate-attachment-signed-url.dto';

export type GenerateAttachmentSignedUrlInput = GenerateAttachmentSignedUrlDto & {
  tenantId: string;
};

export interface GenerateAttachmentSignedUrlResult {
  signedUrl: string;
  filePath: string;
  expiresAt: string;
}

@Injectable()
export class GenerateAttachmentSignedUrlUseCase {
  constructor(
    @Inject(BOOKING_REPOSITORY) private readonly bookingRepo: IBookingRepository,
    @Inject(STORAGE_SERVICE) private readonly storageService: IStorageService,
  ) {}

  async execute(
    input: GenerateAttachmentSignedUrlInput,
  ): Promise<GenerateAttachmentSignedUrlResult> {
    const { tenantId } = input;

    let filePath: string;
    if (input.bookingId) {
      const booking = await this.bookingRepo.findById(input.bookingId, tenantId);
      if (!booking) throw new BookingNotFoundError(input.bookingId);
      filePath = `tenants/${tenantId}/bookings/${input.bookingId}/${input.fileName}`;
    } else {
      filePath = `tenants/${tenantId}/uploads/${uuidv7()}/${input.fileName}`;
    }

    const { signedUrl, expiresAt } = await this.storageService.generateWriteSignedUrl(
      filePath,
      input.contentType,
    );

    return { signedUrl, filePath, expiresAt: expiresAt.toISOString() };
  }
}
