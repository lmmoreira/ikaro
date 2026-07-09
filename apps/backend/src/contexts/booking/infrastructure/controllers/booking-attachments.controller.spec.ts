import { RequestContextBuilder } from '../../../../test/factories/request-context.factory';
import { InMemoryStorageService } from '../../../../test/infrastructure/in-memory-storage.service';
import { GenerateAttachmentSignedUrlUseCase } from '../../application/use-cases/generate-attachment-signed-url.use-case';
import { BookingAttachmentsController } from './booking-attachments.controller';

const TENANT_A = '10000000-0000-4000-8000-000000000401';
const STAFF_ID = '20000000-0000-4000-8000-000000000401';

describe('BookingAttachmentsController', () => {
  let controller: BookingAttachmentsController;
  let storageService: InMemoryStorageService;

  beforeEach(() => {
    storageService = new InMemoryStorageService();

    const ctx = new RequestContextBuilder()
      .withTenantId(TENANT_A)
      .withCorrelationId('corr-attach-ctrl')
      .withActorId(STAFF_ID)
      .withActorRole('MANAGER')
      .build();

    const useCase = new GenerateAttachmentSignedUrlUseCase(storageService);
    controller = new BookingAttachmentsController(ctx, useCase);
  });

  describe('POST /bookings/attachments/signed-url', () => {
    it('returns signedUrl + filePath + expiresAt targeting tmp/ staging', async () => {
      const result = await controller.generateAttachmentSignedUrl({
        fileName: 'car-front.jpg',
        contentType: 'image/jpeg',
      });

      expect(result.signedUrl).toContain('http://fake-gcs/bucket/');
      expect(result.filePath).toMatch(new RegExp(`^tmp/${TENANT_A}/[^/]+/car-front\\.jpg$`));
      expect(result.expiresAt).toBe(new Date('2099-01-01T00:00:00Z').toISOString());
    });
  });
});
