import { HttpException, HttpStatus } from '@nestjs/common';
import { InMemoryTransactionManager } from '../../../../test/infrastructure/in-memory-transaction-manager';
import { InMemoryStorageService } from '../../../../test/infrastructure/in-memory-storage.service';
import { InMemoryFrontendRevalidationPort } from '../../../../test/infrastructure/in-memory-frontend-revalidation.port';
import { RequestContextBuilder } from '../../../../test/factories/request-context.factory';
import { HotsiteConfigBuilder } from '../../../../test/builders/platform';
import { InMemoryHotsiteConfigRepository } from '../../../../test/repositories/platform/in-memory-hotsite-config.repository';
import { InMemoryTenantRepository } from '../../../../test/repositories/platform/in-memory-tenant.repository';
import { HotsiteImagePathsService } from '../../domain/services/hotsite-image-paths.service';
import { HotsiteImageUrlResolver } from '../../domain/services/hotsite-image-url-resolver.service';
import { FeatureBookingPhotoUseCase } from '../../application/use-cases/feature-booking-photo.use-case';
import { FeatureBookingPhotoSchema } from '../../application/dtos/feature-booking-photo.dto';
import { DeleteHotsiteImageUseCase } from '../../application/use-cases/delete-hotsite-image.use-case';
import { DeleteHotsiteImageSchema } from '../../application/dtos/delete-hotsite-image.dto';
import { HotsiteContentReader } from '../../application/services/hotsite-content-reader.service';
import { GetHotsiteContentUseCase } from '../../application/use-cases/get-hotsite-content.use-case';
import { UpdateHotsiteContentUseCase } from '../../application/use-cases/update-hotsite-content.use-case';
import { PublishHotsiteUseCase } from '../../application/use-cases/publish-hotsite.use-case';
import { UnpublishHotsiteUseCase } from '../../application/use-cases/unpublish-hotsite.use-case';
import { GenerateHotsiteImageSignedUrlUseCase } from '../../application/use-cases/generate-hotsite-image-signed-url.use-case';
import { GenerateHotsiteImageReadSignedUrlUseCase } from '../../application/use-cases/generate-hotsite-image-read-signed-url.use-case';
import { Tenant } from '../../domain/tenant.aggregate';
import { Slug } from '../../../../shared/value-objects/slug.vo';
import { TenantSettings } from '../../domain/value-objects/tenant-settings.vo';
import { HotsiteAdminController } from './hotsite-admin.controller';

const TENANT_A = '10000000-0000-4000-8000-000000000001';
const BOOKING_ID = '20000000-0000-4000-8000-000000000001';

describe('HotsiteAdminController', () => {
  let repo: InMemoryHotsiteConfigRepository;
  let tenantRepo: InMemoryTenantRepository;
  let storageService: InMemoryStorageService;
  let frontendRevalidation: InMemoryFrontendRevalidationPort;
  let controller: HotsiteAdminController;

  beforeEach(async () => {
    repo = new InMemoryHotsiteConfigRepository();
    tenantRepo = new InMemoryTenantRepository();
    storageService = new InMemoryStorageService();
    frontendRevalidation = new InMemoryFrontendRevalidationPort();
    const now = new Date();
    await tenantRepo.save(
      Tenant.reconstitute({
        id: TENANT_A,
        name: 'Tenant A',
        slug: Slug.create('tenant-a'),
        settings: TenantSettings.default(),
        isActive: true,
        createdAt: now,
        updatedAt: now,
      }),
    );
    const ctx = new RequestContextBuilder().withTenantId(TENANT_A).build();
    const txManager = new InMemoryTransactionManager();
    const hotsiteContentReader = new HotsiteContentReader(
      repo,
      storageService,
      new HotsiteImageUrlResolver(),
    );

    controller = new HotsiteAdminController(
      ctx,
      new GetHotsiteContentUseCase(hotsiteContentReader),
      new UpdateHotsiteContentUseCase(
        repo,
        storageService,
        txManager,
        new HotsiteImagePathsService(),
      ),
      new PublishHotsiteUseCase(repo, tenantRepo, frontendRevalidation, txManager),
      new UnpublishHotsiteUseCase(repo, tenantRepo, frontendRevalidation, txManager),
      new GenerateHotsiteImageSignedUrlUseCase(storageService),
      new GenerateHotsiteImageReadSignedUrlUseCase(storageService),
      new FeatureBookingPhotoUseCase(storageService),
      new DeleteHotsiteImageUseCase(storageService),
    );
  });

  describe('getContent', () => {
    it('returns branding, layout, seo, and isPublished for the tenant', async () => {
      const config = new HotsiteConfigBuilder().withTenantId(TENANT_A).buildWithContent();
      await repo.save(config);

      const result = await controller.getContent();

      expect(result.branding).toEqual(config.branding);
      expect(result.layout).toEqual(config.layout);
      expect(result.seo).toEqual(config.seo);
      expect(result.isPublished).toBe(config.isPublished);
    });

    it('maps HotsiteNotFoundError to 404 when no config exists for the tenant', async () => {
      const err = await controller.getContent().catch((e: unknown) => e);

      expect(err).toBeInstanceOf(HttpException);
      expect((err as HttpException).getStatus()).toBe(HttpStatus.NOT_FOUND);
    });
  });

  describe('updateContent', () => {
    it('merges and persists branding changes', async () => {
      const config = new HotsiteConfigBuilder().withTenantId(TENANT_A).buildWithContent();
      await repo.save(config);

      const result = await controller.updateContent({ branding: { primaryColor: '#FF5733' } });

      expect(result.branding.primaryColor).toBe('#FF5733');
    });

    it('maps HotsiteNotFoundError to 404 when no config exists for the tenant', async () => {
      const err = await controller
        .updateContent({ branding: { primaryColor: '#FF5733' } })
        .catch((e: unknown) => e);

      expect(err).toBeInstanceOf(HttpException);
      expect((err as HttpException).getStatus()).toBe(HttpStatus.NOT_FOUND);
    });

    it('maps PlatformDomainError to 400 when branding has an invalid hex color', async () => {
      const config = new HotsiteConfigBuilder().withTenantId(TENANT_A).buildWithContent();
      await repo.save(config);

      const err = await controller
        .updateContent({ branding: { primaryColor: 'not-a-color' } })
        .catch((e: unknown) => e);

      expect(err).toBeInstanceOf(HttpException);
      expect((err as HttpException).getStatus()).toBe(HttpStatus.BAD_REQUEST);
    });

    it('maps HotsiteImageNotUploadedError to 400 when the branding logoUrl is not in storage', async () => {
      const config = new HotsiteConfigBuilder().withTenantId(TENANT_A).buildWithContent();
      await repo.save(config);
      const logoPath = `tenants/${TENANT_A}/hotsite/branding/u1/logo.png`;

      const err = await controller
        .updateContent({ branding: { logoUrl: logoPath } })
        .catch((e: unknown) => e);

      expect(err).toBeInstanceOf(HttpException);
      expect((err as HttpException).getStatus()).toBe(HttpStatus.BAD_REQUEST);
    });

    it('merges and persists seo title and description changes', async () => {
      const config = new HotsiteConfigBuilder().withTenantId(TENANT_A).buildWithContent();
      await repo.save(config);

      const result = await controller.updateContent({
        seo: { title: 'Lavacar Estrela — Agendamento Online', description: 'Agende já.' },
      });

      expect(result.seo).toEqual({
        title: 'Lavacar Estrela — Agendamento Online',
        description: 'Agende já.',
      });
    });

    it('maps PlatformDomainError to 400 when seo.title exceeds 60 characters', async () => {
      const config = new HotsiteConfigBuilder().withTenantId(TENANT_A).buildWithContent();
      await repo.save(config);

      const err = await controller
        .updateContent({ seo: { title: 'a'.repeat(61) } })
        .catch((e: unknown) => e);

      expect(err).toBeInstanceOf(HttpException);
      expect((err as HttpException).getStatus()).toBe(HttpStatus.BAD_REQUEST);
    });
  });

  describe('publish', () => {
    it('publishes the hotsite and returns isPublished true', async () => {
      const config = new HotsiteConfigBuilder().withTenantId(TENANT_A).buildWithContent();
      await repo.save(config);

      const result = await controller.publish();

      expect(result.isPublished).toBe(true);
    });

    it('maps HotsiteNotFoundError to 404 when no config exists for the tenant', async () => {
      const err = await controller.publish().catch((e: unknown) => e);

      expect(err).toBeInstanceOf(HttpException);
      expect((err as HttpException).getStatus()).toBe(HttpStatus.NOT_FOUND);
    });

    it('maps PlatformDomainError to 400 when the layout has no enabled modules', async () => {
      const config = new HotsiteConfigBuilder().withTenantId(TENANT_A).build();
      await repo.save(config);

      const err = await controller.publish().catch((e: unknown) => e);

      expect(err).toBeInstanceOf(HttpException);
      expect((err as HttpException).getStatus()).toBe(HttpStatus.BAD_REQUEST);
    });
  });

  describe('unpublish', () => {
    it('unpublishes the hotsite and returns isPublished false', async () => {
      const config = new HotsiteConfigBuilder().withTenantId(TENANT_A).buildPublished();
      await repo.save(config);

      const result = await controller.unpublish();

      expect(result.isPublished).toBe(false);
    });

    it('maps HotsiteNotFoundError to 404 when no config exists for the tenant', async () => {
      const err = await controller.unpublish().catch((e: unknown) => e);

      expect(err).toBeInstanceOf(HttpException);
      expect((err as HttpException).getStatus()).toBe(HttpStatus.NOT_FOUND);
    });
  });

  describe('generateImageSignedUrl', () => {
    it('returns a tenant-scoped tmp/ staging filePath, signedUrl, and expiresAt', async () => {
      const result = await controller.generateImageSignedUrl({
        fileName: 'logo.png',
        contentType: 'image/png',
        purpose: 'branding',
      });

      expect(result.filePath.startsWith(`tmp/${TENANT_A}/branding/`)).toBe(true);
      expect(result.signedUrl).toContain(result.filePath);
      expect(result.expiresAt).toBe('2099-01-01T00:00:00.000Z');
    });

    it('accepts purpose "testimonials" (avatar uploads)', async () => {
      const result = await controller.generateImageSignedUrl({
        fileName: 'avatar.png',
        contentType: 'image/png',
        purpose: 'testimonials',
      });

      expect(result.filePath.startsWith(`tmp/${TENANT_A}/testimonials/`)).toBe(true);
    });
  });

  describe('generateImageReadSignedUrl', () => {
    it('returns a signedUrl and expiresAt for a tenant-owned tmp/ path', async () => {
      const filePath = `tmp/${TENANT_A}/branding/u1/logo.png`;

      const result = await controller.generateImageReadSignedUrl({ filePath });

      expect(result.signedUrl).toContain(filePath);
      expect(result.expiresAt).toBe('2099-01-01T00:00:00.000Z');
    });

    it('maps HotsiteImageNotUploadedError to 400 for a cross-tenant tmp/ path', async () => {
      const filePath = 'tmp/other-tenant/branding/u1/logo.png';

      const err = await controller
        .generateImageReadSignedUrl({ filePath })
        .catch((e: unknown) => e);

      expect(err).toBeInstanceOf(HttpException);
      expect((err as HttpException).getStatus()).toBe(HttpStatus.BAD_REQUEST);
    });
  });

  describe('featureBookingPhoto', () => {
    const AFTER_PHOTO = `tenants/${TENANT_A}/bookings/${BOOKING_ID}/after-1.jpg`;
    const OTHER_TENANT_PHOTO = `tenants/20000000-0000-4000-8000-000000000002/bookings/${BOOKING_ID}/after-1.jpg`;

    it('copies the booking photo into the public bucket and returns filePath, url, photoType', async () => {
      storageService.markAsUploaded(AFTER_PHOTO);

      const result = await controller.featureBookingPhoto({
        bookingId: BOOKING_ID,
        filePath: AFTER_PHOTO,
        photoType: 'after',
      });

      expect(result.photoType).toBe('after');
      expect(result.filePath.startsWith(`tenants/${TENANT_A}/hotsite/gallery/`)).toBe(true);
      expect(result.url).toBe(storageService.getPublicUrl(result.filePath));
    });

    it('maps HotsiteImageNotUploadedError to 400 when the source photo does not exist', async () => {
      const err = await controller
        .featureBookingPhoto({
          bookingId: BOOKING_ID,
          filePath: `tenants/${TENANT_A}/bookings/${BOOKING_ID}/missing.jpg`,
          photoType: 'after',
        })
        .catch((e: unknown) => e);

      expect(err).toBeInstanceOf(HttpException);
      expect((err as HttpException).getStatus()).toBe(HttpStatus.BAD_REQUEST);
    });

    it('maps HotsiteImageNotUploadedError to 400 when the photo path belongs to another tenant', async () => {
      storageService.markAsUploaded(OTHER_TENANT_PHOTO);
      const err = await controller
        .featureBookingPhoto({
          bookingId: BOOKING_ID,
          filePath: OTHER_TENANT_PHOTO,
          photoType: 'after',
        })
        .catch((e: unknown) => e);

      expect(err).toBeInstanceOf(HttpException);
      expect((err as HttpException).getStatus()).toBe(HttpStatus.BAD_REQUEST);
    });
  });

  describe('FeatureBookingPhotoSchema', () => {
    it('rejects a filePath that does not belong to the provided bookingId', () => {
      const result = FeatureBookingPhotoSchema.safeParse({
        bookingId: BOOKING_ID,
        filePath: `tenants/${TENANT_A}/bookings/another-booking/after-1.jpg`,
        photoType: 'after',
      });

      expect(result.success).toBe(false);
    });
  });

  describe('deleteImage', () => {
    const LOGO_PATH = `tenants/${TENANT_A}/hotsite/branding/u1/logo.png`;
    const OTHER_TENANT_LOGO_PATH = `tenants/20000000-0000-4000-8000-000000000002/hotsite/branding/u1/logo.png`;

    it('deletes the image from the public bucket', async () => {
      storageService.markAsUploaded(LOGO_PATH);

      await controller.deleteImage({ filePath: LOGO_PATH });

      expect(storageService.deletedPaths).toContain(LOGO_PATH);
    });

    it('maps HotsiteImageNotUploadedError to 400 when the path belongs to another tenant', async () => {
      storageService.markAsUploaded(OTHER_TENANT_LOGO_PATH);

      const err = await controller
        .deleteImage({ filePath: OTHER_TENANT_LOGO_PATH })
        .catch((e: unknown) => e);

      expect(err).toBeInstanceOf(HttpException);
      expect((err as HttpException).getStatus()).toBe(HttpStatus.BAD_REQUEST);
    });
  });

  describe('DeleteHotsiteImageSchema', () => {
    it('rejects a filePath outside the tenants/<id>/hotsite/... shape', () => {
      const result = DeleteHotsiteImageSchema.safeParse({
        filePath: `tenants/${TENANT_A}/bookings/${BOOKING_ID}/after-1.jpg`,
      });

      expect(result.success).toBe(false);
    });

    it('accepts a well-formed hotsite image path', () => {
      const result = DeleteHotsiteImageSchema.safeParse({
        filePath: `tenants/${TENANT_A}/hotsite/branding/u1/logo.png`,
      });

      expect(result.success).toBe(true);
    });
  });
});
