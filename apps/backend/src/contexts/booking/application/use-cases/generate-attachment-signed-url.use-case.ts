import { Inject, Injectable } from '@nestjs/common';
import { uuidv7 } from '../../../../shared/domain/uuid-v7';
import { IStorageService, STORAGE_SERVICE } from '../../../../shared/ports/storage.service.port';
import { RequestContext } from '../../../../shared/request/request-context';
import { BookingNotFoundError } from '../../domain/errors/booking-domain.error';
import { IBookingRepository, BOOKING_REPOSITORY } from '../ports/booking-repository.port';
import { GenerateAttachmentSignedUrlDto } from '../dtos/generate-attachment-signed-url.dto';

export interface GenerateAttachmentSignedUrlResult {
  signedUrl: string;
  filePath: string;
  expiresAt: string;
}

@Injectable()
export class GenerateAttachmentSignedUrlUseCase {
  constructor(
    private readonly tenantContext: RequestContext,
    @Inject(BOOKING_REPOSITORY) private readonly bookingRepo: IBookingRepository,
    @Inject(STORAGE_SERVICE) private readonly storageService: IStorageService,
  ) {}

  async execute(dto: GenerateAttachmentSignedUrlDto): Promise<GenerateAttachmentSignedUrlResult> {
    const tenantId = this.tenantContext.tenantId;

    let filePath: string;
    if (dto.bookingId) {
      const booking = await this.bookingRepo.findById(dto.bookingId, tenantId);
      if (!booking) throw new BookingNotFoundError(dto.bookingId);
      filePath = `tenants/${tenantId}/bookings/${dto.bookingId}/${dto.fileName}`;
    } else {
      filePath = `tenants/${tenantId}/uploads/${uuidv7()}/${dto.fileName}`;
    }

    const { signedUrl, expiresAt } = await this.storageService.generateWriteSignedUrl(
      filePath,
      dto.contentType,
    );

    return { signedUrl, filePath, expiresAt: expiresAt.toISOString() };
  }
}
