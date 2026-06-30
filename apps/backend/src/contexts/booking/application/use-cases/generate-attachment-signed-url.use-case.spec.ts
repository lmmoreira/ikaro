import { BookingBuilder } from '../../../../test/builders/booking/booking.builder';
import { InMemoryBookingRepository } from '../../../../test/repositories/booking/in-memory-booking.repository';
import { InMemoryStorageService } from '../../../../test/infrastructure/in-memory-storage.service';
import { BookingNotFoundError } from '../../domain/errors/booking-domain.error';
import { GenerateAttachmentSignedUrlUseCase } from './generate-attachment-signed-url.use-case';

const TENANT_A = '10000000-0000-4000-8000-000000000301';
const TENANT_B = '10000000-0000-4000-8000-000000000302';
const BOOKING_ID = '30000000-0000-4000-8000-000000000301';

describe('GenerateAttachmentSignedUrlUseCase', () => {
  let bookingRepo: InMemoryBookingRepository;
  let storageService: InMemoryStorageService;
  let useCase: GenerateAttachmentSignedUrlUseCase;

  beforeEach(() => {
    bookingRepo = new InMemoryBookingRepository();
    storageService = new InMemoryStorageService();
    useCase = new GenerateAttachmentSignedUrlUseCase(bookingRepo, storageService);
  });

  describe('without bookingId (pre-upload path)', () => {
    it('returns signed URL with uploads/ path', async () => {
      const result = await useCase.execute({
        fileName: 'car-front.jpg',
        contentType: 'image/jpeg',
        tenantId: TENANT_A,
      });

      expect(result.signedUrl).toContain('http://fake-gcs/bucket/');
      expect(result.filePath).toMatch(/^tenants\/[^/]+\/uploads\/[^/]+\/car-front\.jpg$/);
      expect(result.filePath).toContain(TENANT_A);
      expect(result.expiresAt).toBeDefined();
    });

    it('generates a unique upload folder each call', async () => {
      const r1 = await useCase.execute({ fileName: 'a.jpg', contentType: 'image/jpeg', tenantId: TENANT_A });
      const r2 = await useCase.execute({ fileName: 'a.jpg', contentType: 'image/jpeg', tenantId: TENANT_A });
      expect(r1.filePath).not.toBe(r2.filePath);
    });
  });

  describe('with bookingId (booking-scoped path)', () => {
    beforeEach(async () => {
      const booking = new BookingBuilder().withId(BOOKING_ID).withTenantId(TENANT_A).build();
      await bookingRepo.save(booking);
    });

    it('returns signed URL with bookings/ path', async () => {
      const result = await useCase.execute({
        fileName: 'after.jpg',
        contentType: 'image/jpeg',
        bookingId: BOOKING_ID,
        tenantId: TENANT_A,
      });

      expect(result.filePath).toBe(`tenants/${TENANT_A}/bookings/${BOOKING_ID}/after.jpg`);
    });

    it('throws BookingNotFoundError when booking does not exist', async () => {
      await expect(
        useCase.execute({
          fileName: 'after.jpg',
          contentType: 'image/jpeg',
          bookingId: '99999999-0000-4000-8000-000000000000',
          tenantId: TENANT_A,
        }),
      ).rejects.toThrow(BookingNotFoundError);
    });
  });

  describe('tenant isolation', () => {
    it('returns 404 when bookingId belongs to a different tenant', async () => {
      const booking = new BookingBuilder().withId(BOOKING_ID).withTenantId(TENANT_B).build();
      await bookingRepo.save(booking);

      await expect(
        useCase.execute({
          fileName: 'after.jpg',
          contentType: 'image/jpeg',
          bookingId: BOOKING_ID,
          tenantId: TENANT_A,
        }),
      ).rejects.toThrow(BookingNotFoundError);
    });
  });
});
