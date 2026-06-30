import { InMemoryStorageService } from '../../../../test/infrastructure/in-memory-storage.service';
import { InMemoryPlatformBookingPort } from '../../../../test/infrastructure/in-memory-platform-booking.port';
import {
  FeaturedBookingNotFoundError,
  PhotoNotOnBookingError,
} from '../../domain/errors/platform-domain.error';
import { FeatureBookingPhotoUseCase } from './feature-booking-photo.use-case';

const TENANT_A = '10000000-0000-4000-8000-000000000001';
const TENANT_B = '10000000-0000-4000-8000-000000000002';
const BOOKING_ID = '20000000-0000-4000-8000-000000000001';
const BEFORE_PHOTO = `tenants/${TENANT_A}/bookings/${BOOKING_ID}/before-1.jpg`;
const AFTER_PHOTO = `tenants/${TENANT_A}/bookings/${BOOKING_ID}/after-1.jpg`;

describe('FeatureBookingPhotoUseCase', () => {
  let bookingLookup: InMemoryPlatformBookingPort;
  let storageService: InMemoryStorageService;
  let useCase: FeatureBookingPhotoUseCase;

  beforeEach(() => {
    bookingLookup = new InMemoryPlatformBookingPort();
    storageService = new InMemoryStorageService();
    bookingLookup.setBooking(TENANT_A, {
      id: BOOKING_ID,
      customerId: 'customer-1',
      beforeServicePhotoUrls: [BEFORE_PHOTO],
      afterServicePhotoUrls: [AFTER_PHOTO],
    });
    useCase = new FeatureBookingPhotoUseCase(bookingLookup, storageService);
  });

  it('derives photoType "before" and copies the photo into the public bucket', async () => {
    const result = await useCase.execute({ tenantId: TENANT_A, bookingId: BOOKING_ID, photoUrl: BEFORE_PHOTO });

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

  it('derives photoType "after" when the photo is in the after-service list', async () => {
    const result = await useCase.execute({ tenantId: TENANT_A, bookingId: BOOKING_ID, photoUrl: AFTER_PHOTO });

    expect(result.photoType).toBe('after');
  });

  it('throws FeaturedBookingNotFoundError when the booking does not exist for the tenant', async () => {
    await expect(
      useCase.execute({ tenantId: TENANT_A, bookingId: '30000000-0000-4000-8000-000000000099', photoUrl: AFTER_PHOTO }),
    ).rejects.toThrow(FeaturedBookingNotFoundError);
  });

  it('throws PhotoNotOnBookingError when the photoUrl is on neither before nor after lists', async () => {
    const strangerPhoto = `tenants/${TENANT_A}/bookings/${BOOKING_ID}/not-on-booking.jpg`;

    await expect(
      useCase.execute({ tenantId: TENANT_A, bookingId: BOOKING_ID, photoUrl: strangerPhoto }),
    ).rejects.toThrow(PhotoNotOnBookingError);
  });

  it('works identically for a guest-originated booking (customerId: null)', async () => {
    bookingLookup.setBooking(TENANT_A, {
      id: BOOKING_ID,
      customerId: null,
      beforeServicePhotoUrls: [BEFORE_PHOTO],
      afterServicePhotoUrls: [AFTER_PHOTO],
    });

    const result = await useCase.execute({ tenantId: TENANT_A, bookingId: BOOKING_ID, photoUrl: BEFORE_PHOTO });

    expect(result.photoType).toBe('before');
  });

  it('tenant isolation: cannot feature a photo from another tenant booking', async () => {
    await expect(
      useCase.execute({ tenantId: TENANT_B, bookingId: BOOKING_ID, photoUrl: AFTER_PHOTO }),
    ).rejects.toThrow(FeaturedBookingNotFoundError);
  });
});
