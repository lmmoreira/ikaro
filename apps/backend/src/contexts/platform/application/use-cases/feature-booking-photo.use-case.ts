import { Inject, Injectable } from '@nestjs/common';
import { uuidv7 } from '../../../../shared/domain/uuid-v7';
import { IStorageService, STORAGE_SERVICE } from '../../../../shared/ports/storage.service.port';
import { PLATFORM_BOOKING_PORT, IPlatformBookingPort } from '../ports/platform-booking.port';
import {
  FeaturedBookingNotFoundError,
  PhotoNotOnBookingError,
} from '../../domain/errors/platform-domain.error';
import { FeatureBookingPhotoDto } from '../dtos/feature-booking-photo.dto';

export type FeatureBookingPhotoUseCaseInput = FeatureBookingPhotoDto & { tenantId: string };

export interface FeatureBookingPhotoUseCaseResult {
  filePath: string;
  url: string;
  photoType: 'before' | 'after';
}

@Injectable()
export class FeatureBookingPhotoUseCase {
  constructor(
    @Inject(PLATFORM_BOOKING_PORT) private readonly bookingLookup: IPlatformBookingPort,
    @Inject(STORAGE_SERVICE) private readonly storageService: IStorageService,
  ) {}

  async execute(dto: FeatureBookingPhotoUseCaseInput): Promise<FeatureBookingPhotoUseCaseResult> {
    const { tenantId } = dto;

    const booking = await this.bookingLookup.findById(dto.bookingId, tenantId);
    if (!booking) throw new FeaturedBookingNotFoundError(dto.bookingId);

    const photoType = this.derivePhotoType(booking, dto.photoUrl);

    const fileName = dto.photoUrl.split('/').pop()!;
    const filePath = `tenants/${tenantId}/hotsite/gallery/${uuidv7()}/${fileName}`;

    await this.storageService.copy(dto.photoUrl, filePath);

    return { filePath, url: this.storageService.getPublicUrl(filePath), photoType };
  }

  private derivePhotoType(
    booking: { beforeServicePhotoUrls: string[]; afterServicePhotoUrls: string[] },
    photoUrl: string,
  ): 'before' | 'after' {
    if (booking.beforeServicePhotoUrls.includes(photoUrl)) return 'before';
    if (booking.afterServicePhotoUrls.includes(photoUrl)) return 'after';
    throw new PhotoNotOnBookingError(photoUrl);
  }
}
