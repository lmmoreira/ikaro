import { Inject, Injectable } from '@nestjs/common';
import { uuidv7 } from '../../../../shared/domain/uuid-v7';
import { IStorageService, STORAGE_SERVICE } from '../../../../shared/ports/storage.service.port';
import { HotsiteImageNotUploadedError } from '../../domain/errors/platform-domain.error';
import { FeatureBookingPhotoDto } from '../dtos/feature-booking-photo.dto';

export type FeatureBookingPhotoUseCaseInput = FeatureBookingPhotoDto & { tenantId: string };

export interface FeatureBookingPhotoUseCaseResult {
  filePath: string;
  url: string;
  photoType: 'before' | 'after';
}

@Injectable()
export class FeatureBookingPhotoUseCase {
  constructor(@Inject(STORAGE_SERVICE) private readonly storageService: IStorageService) {}

  async execute(dto: FeatureBookingPhotoUseCaseInput): Promise<FeatureBookingPhotoUseCaseResult> {
    const { tenantId } = dto;

    const sourceTenantId = this.extractTenantId(dto.filePath);
    if (sourceTenantId !== tenantId) {
      throw new HotsiteImageNotUploadedError(dto.filePath);
    }

    const exists = await this.storageService.exists(dto.filePath);
    if (!exists) throw new HotsiteImageNotUploadedError(dto.filePath);

    const fileName = dto.filePath.split('/').pop()!;
    const filePath = `tenants/${tenantId}/hotsite/gallery/${uuidv7()}/${fileName}`;

    await this.storageService.copy(dto.filePath, filePath);

    return { filePath, url: this.storageService.getPublicUrl(filePath), photoType: dto.photoType };
  }

  private extractTenantId(filePath: string): string | null {
    const match = filePath.match(/^tenants\/([^/]+)\/bookings\/[^/]+\/.+$/);
    return match?.[1] ?? null;
  }
}
