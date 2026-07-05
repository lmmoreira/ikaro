import { InMemoryStorageService } from '../../../../test/infrastructure/in-memory-storage.service';
import { HotsiteImageNotUploadedError } from '../../domain/errors/platform-domain.error';
import { FeatureBookingPhotoUseCase } from './feature-booking-photo.use-case';

const TENANT_A = '10000000-0000-4000-8000-000000000001';
const TENANT_B = '10000000-0000-4000-8000-000000000002';
const BOOKING_ID = '20000000-0000-4000-8000-000000000001';
const BEFORE_PHOTO = `tenants/${TENANT_A}/bookings/${BOOKING_ID}/before-1.jpg`;
const AFTER_PHOTO = `tenants/${TENANT_A}/bookings/${BOOKING_ID}/after-1.jpg`;
const OTHER_TENANT_PHOTO = `tenants/${TENANT_B}/bookings/${BOOKING_ID}/after-1.jpg`;

describe('FeatureBookingPhotoUseCase', () => {
  let storageService: InMemoryStorageService;
  let useCase: FeatureBookingPhotoUseCase;

  beforeEach(() => {
    storageService = new InMemoryStorageService();
    storageService.markAsUploaded(BEFORE_PHOTO);
    storageService.markAsUploaded(AFTER_PHOTO);
    storageService.markAsUploaded(OTHER_TENANT_PHOTO);
    useCase = new FeatureBookingPhotoUseCase(storageService);
  });

  it('copies the photo into the public bucket and echoes the provided photoType', async () => {
    const result = await useCase.execute({
      tenantId: TENANT_A,
      bookingId: BOOKING_ID,
      filePath: BEFORE_PHOTO,
      photoType: 'before',
    });

    expect(result.photoType).toBe('before');
    expect(result.filePath).toMatch(
      new RegExp(`^tenants/${TENANT_A}/hotsite/gallery/[0-9a-f-]+/before-1\\.jpg$`),
    );
    expect(result.url).toBe(storageService.getPublicUrl(result.filePath));
    expect(storageService.copiedPaths).toContainEqual({
      sourcePath: BEFORE_PHOTO,
      destinationPath: result.filePath,
    });
  });

  it('echoes photoType "after" when the caller marks the source photo as after', async () => {
    const result = await useCase.execute({
      tenantId: TENANT_A,
      bookingId: BOOKING_ID,
      filePath: AFTER_PHOTO,
      photoType: 'after',
    });

    expect(result.photoType).toBe('after');
  });

  it('throws HotsiteImageNotUploadedError when the source photo does not exist', async () => {
    await expect(
      useCase.execute({
        tenantId: TENANT_A,
        bookingId: BOOKING_ID,
        filePath: `tenants/${TENANT_A}/bookings/${BOOKING_ID}/missing.jpg`,
        photoType: 'after',
      }),
    ).rejects.toThrow(HotsiteImageNotUploadedError);
  });

  it('tenant isolation: cannot feature a photo from another tenant booking', async () => {
    await expect(
      useCase.execute({
        tenantId: TENANT_A,
        bookingId: BOOKING_ID,
        filePath: OTHER_TENANT_PHOTO,
        photoType: 'after',
      }),
    ).rejects.toThrow(HotsiteImageNotUploadedError);
  });
});
