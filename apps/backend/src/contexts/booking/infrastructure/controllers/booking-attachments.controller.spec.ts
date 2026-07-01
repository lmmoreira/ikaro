import { HttpStatus } from '@nestjs/common';
import { InMemoryBookingRepository } from '../../../../test/repositories/booking/in-memory-booking.repository';
import { RequestContextBuilder } from '../../../../test/factories/request-context.factory';
import { InMemoryStorageService } from '../../../../test/infrastructure/in-memory-storage.service';
import { BookingBuilder } from '../../../../test/builders/booking/booking.builder';
import { GenerateAttachmentSignedUrlUseCase } from '../../application/use-cases/generate-attachment-signed-url.use-case';
import { BookingAttachmentsController } from './booking-attachments.controller';

const TENANT_A = '10000000-0000-4000-8000-000000000401';
const TENANT_B = '10000000-0000-4000-8000-000000000402';
const STAFF_ID = '20000000-0000-4000-8000-000000000401';
const BOOKING_ID = '30000000-0000-4000-8000-000000000401';

describe('BookingAttachmentsController', () => {
  let controller: BookingAttachmentsController;
  let bookingRepo: InMemoryBookingRepository;
  let storageService: InMemoryStorageService;

  beforeEach(async () => {
    bookingRepo = new InMemoryBookingRepository();
    storageService = new InMemoryStorageService();

    const ctx = new RequestContextBuilder()
      .withTenantId(TENANT_A)
      .withCorrelationId('corr-attach-ctrl')
      .withActorId(STAFF_ID)
      .withActorRole('MANAGER')
      .build();

    const useCase = new GenerateAttachmentSignedUrlUseCase(bookingRepo, storageService);
    controller = new BookingAttachmentsController(ctx, useCase);
  });

  describe('POST /bookings/attachments/signed-url', () => {
    it('returns signedUrl + filePath + expiresAt for uploads/ scenario (no bookingId)', async () => {
      const result = await controller.generateAttachmentSignedUrl({
        fileName: 'car-front.jpg',
        contentType: 'image/jpeg',
      });

      expect(result.signedUrl).toContain('http://fake-gcs/bucket/');
      expect(result.filePath).toMatch(/^tenants\/[^/]+\/uploads\/[^/]+\/car-front\.jpg$/);
      expect(result.expiresAt).toBe(new Date('2099-01-01T00:00:00Z').toISOString());
    });

    it('returns bookings/ path when bookingId is provided', async () => {
      const booking = new BookingBuilder().withId(BOOKING_ID).withTenantId(TENANT_A).build();
      await bookingRepo.save(booking);

      const result = await controller.generateAttachmentSignedUrl({
        fileName: 'after.jpg',
        contentType: 'image/jpeg',
        bookingId: BOOKING_ID,
      });

      expect(result.filePath).toBe(`tenants/${TENANT_A}/bookings/${BOOKING_ID}/after.jpg`);
    });

    it('maps BookingNotFoundError to 404 when bookingId not found', async () => {
      await expect(
        controller.generateAttachmentSignedUrl({
          fileName: 'after.jpg',
          contentType: 'image/jpeg',
          bookingId: '99999999-0000-4000-8000-000000000000',
        }),
      ).rejects.toMatchObject({ status: HttpStatus.NOT_FOUND });
    });

    it('maps BookingNotFoundError to 404 for cross-tenant bookingId (tenant isolation)', async () => {
      const booking = new BookingBuilder().withId(BOOKING_ID).withTenantId(TENANT_B).build();
      await bookingRepo.save(booking);

      await expect(
        controller.generateAttachmentSignedUrl({
          fileName: 'after.jpg',
          contentType: 'image/jpeg',
          bookingId: BOOKING_ID,
        }),
      ).rejects.toMatchObject({ status: HttpStatus.NOT_FOUND });
    });
  });
});
