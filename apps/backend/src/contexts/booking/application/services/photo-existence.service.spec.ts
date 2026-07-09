import { InMemoryStorageService } from '../../../../test/infrastructure/in-memory-storage.service';
import { BookingPhotoNotUploadedError } from '../../domain/errors/booking-domain.error';
import { PhotoExistenceService } from './photo-existence.service';

const TENANT_A = 'tenant-a';
const TENANT_B = 'tenant-b';
const BOOKING_ID = 'booking-1';

describe('PhotoExistenceService', () => {
  let storageService: InMemoryStorageService;
  let service: PhotoExistenceService;

  beforeEach(() => {
    storageService = new InMemoryStorageService();
    service = new PhotoExistenceService(storageService);
  });

  describe('preparePhotoPromotion()', () => {
    it('resolves with empty results when the list is empty', async () => {
      const result = await service.preparePhotoPromotion([], TENANT_A, BOOKING_ID);
      expect(result).toEqual({ permanentPaths: [], operations: [] });
    });

    it('computes the permanent path and a pending operation for each existing tmp path, without mutating storage', async () => {
      storageService.markAsUploaded('tmp/tenant-a/u1/photo1.jpg');
      storageService.markAsUploaded('tmp/tenant-a/u2/photo2.jpg');

      const result = await service.preparePhotoPromotion(
        ['tmp/tenant-a/u1/photo1.jpg', 'tmp/tenant-a/u2/photo2.jpg'],
        TENANT_A,
        BOOKING_ID,
      );

      expect(result.permanentPaths).toEqual([
        `tenants/${TENANT_A}/bookings/${BOOKING_ID}/photo1.jpg`,
        `tenants/${TENANT_A}/bookings/${BOOKING_ID}/photo2.jpg`,
      ]);
      expect(result.operations).toEqual([
        {
          from: 'tmp/tenant-a/u1/photo1.jpg',
          to: `tenants/${TENANT_A}/bookings/${BOOKING_ID}/photo1.jpg`,
        },
        {
          from: 'tmp/tenant-a/u2/photo2.jpg',
          to: `tenants/${TENANT_A}/bookings/${BOOKING_ID}/photo2.jpg`,
        },
      ]);
      expect(storageService.copiedPaths).toEqual([]);
      expect(storageService.deletedPaths).toEqual([]);
    });

    it('throws BookingPhotoNotUploadedError for a non-existent tmp path', async () => {
      await expect(
        service.preparePhotoPromotion(['tmp/tenant-a/u1/missing.jpg'], TENANT_A, BOOKING_ID),
      ).rejects.toThrow(BookingPhotoNotUploadedError);
    });

    it('includes the missing storage path in the error message', async () => {
      await expect(
        service.preparePhotoPromotion(['tmp/tenant-a/u1/missing.jpg'], TENANT_A, BOOKING_ID),
      ).rejects.toThrow('tmp/tenant-a/u1/missing.jpg');
    });

    it('tenant isolation: rejects a tmp path that exists but belongs to another tenant', async () => {
      const otherTenantPath = `tmp/${TENANT_B}/u1/photo1.jpg`;
      storageService.markAsUploaded(otherTenantPath);

      await expect(
        service.preparePhotoPromotion([otherTenantPath], TENANT_A, BOOKING_ID),
      ).rejects.toBeInstanceOf(BookingPhotoNotUploadedError);
    });

    it('tenant isolation: rejects a path with no tmp/ prefix at all', async () => {
      storageService.markAsUploaded('tenants/tenant-a/bookings/other/photo1.jpg');

      await expect(
        service.preparePhotoPromotion(
          ['tenants/tenant-a/bookings/other/photo1.jpg'],
          TENANT_A,
          BOOKING_ID,
        ),
      ).rejects.toBeInstanceOf(BookingPhotoNotUploadedError);
    });
  });

  describe('executePhotoPromotion()', () => {
    it('copies each operation from its tmp path to its permanent path and deletes the tmp source', async () => {
      storageService.markAsUploaded('tmp/tenant-a/u1/photo1.jpg');
      const operations = [
        {
          from: 'tmp/tenant-a/u1/photo1.jpg',
          to: `tenants/${TENANT_A}/bookings/${BOOKING_ID}/photo1.jpg`,
        },
      ];

      await service.executePhotoPromotion(operations);

      expect(storageService.copiedPaths).toEqual([
        { sourcePath: operations[0].from, destinationPath: operations[0].to },
      ]);
      expect(storageService.deletedPaths).toEqual([operations[0].from]);
    });

    it('resolves without doing anything for an empty operations list', async () => {
      await expect(service.executePhotoPromotion([])).resolves.toBeUndefined();
    });

    it('is best-effort — a failure on one operation does not stop the rest', async () => {
      const failingStorage: InMemoryStorageService & { copy: jest.Mock } = Object.assign(
        new InMemoryStorageService(),
        {
          copy: jest.fn().mockRejectedValueOnce(new Error('boom')).mockResolvedValueOnce(undefined),
        },
      );
      const failingService = new PhotoExistenceService(failingStorage);
      const operations = [
        { from: 'tmp/tenant-a/u1/a.jpg', to: `tenants/${TENANT_A}/bookings/${BOOKING_ID}/a.jpg` },
        { from: 'tmp/tenant-a/u2/b.jpg', to: `tenants/${TENANT_A}/bookings/${BOOKING_ID}/b.jpg` },
      ];

      await expect(failingService.executePhotoPromotion(operations)).resolves.toBeUndefined();
      expect(failingStorage.copy).toHaveBeenCalledTimes(2);
    });
  });
});
