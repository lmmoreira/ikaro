import { HttpException, HttpStatus } from '@nestjs/common';
import { InMemoryTransactionManager } from '../../../../test/infrastructure/in-memory-transaction-manager';
import { InMemoryStorageService } from '../../../../test/infrastructure/in-memory-storage.service';
import { InMemoryFrontendRevalidationPort } from '../../../../test/infrastructure/in-memory-frontend-revalidation.port';
import { TenantContextBuilder } from '../../../../test/factories/tenant-context.factory';
import { HotsiteConfigBuilder } from '../../../../test/builders/platform';
import { InMemoryHotsiteConfigRepository } from '../../../../test/repositories/platform/in-memory-hotsite-config.repository';
import { InMemoryTenantRepository } from '../../../../test/repositories/platform/in-memory-tenant.repository';
import { InMemoryPlatformBookingPort } from '../../../../test/infrastructure/in-memory-platform-booking.port';
import { HotsiteImagePathsService } from '../../domain/services/hotsite-image-paths.service';
import { HotsiteImageUrlResolver } from '../../domain/services/hotsite-image-url-resolver.service';
import { FeatureBookingPhotoUseCase } from '../../application/use-cases/feature-booking-photo.use-case';
import { GetHotsiteContentUseCase } from '../../application/use-cases/get-hotsite-content.use-case';
import { UpdateHotsiteContentUseCase } from '../../application/use-cases/update-hotsite-content.use-case';
import { PublishHotsiteUseCase } from '../../application/use-cases/publish-hotsite.use-case';
import { UnpublishHotsiteUseCase } from '../../application/use-cases/unpublish-hotsite.use-case';
import { GenerateHotsiteImageSignedUrlUseCase } from '../../application/use-cases/generate-hotsite-image-signed-url.use-case';
import { Tenant } from '../../domain/tenant.aggregate';
import { Slug } from '../../../../shared/value-objects/slug.vo';
import { TenantSettings } from '../../domain/value-objects/tenant-settings.vo';
import { HotsiteAdminController } from './hotsite-admin.controller';

const TENANT_A = '10000000-0000-4000-8000-000000000001';

describe('HotsiteAdminController', () => {
  let repo: InMemoryHotsiteConfigRepository;
  let tenantRepo: InMemoryTenantRepository;
  let storageService: InMemoryStorageService;
  let bookingLookup: InMemoryPlatformBookingPort;
  let frontendRevalidation: InMemoryFrontendRevalidationPort;
  let controller: HotsiteAdminController;

  beforeEach(async () => {
    repo = new InMemoryHotsiteConfigRepository();
    tenantRepo = new InMemoryTenantRepository();
    storageService = new InMemoryStorageService();
    bookingLookup = new InMemoryPlatformBookingPort();
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
    const ctx = new TenantContextBuilder().withTenantId(TENANT_A).build();
    const txManager = new InMemoryTransactionManager();

    controller = new HotsiteAdminController(
      new GetHotsiteContentUseCase(repo, storageService, ctx, new HotsiteImageUrlResolver()),
      new UpdateHotsiteContentUseCase(
        repo,
        storageService,
        txManager,
        ctx,
        new HotsiteImagePathsService(),
      ),
      new PublishHotsiteUseCase(repo, tenantRepo, frontendRevalidation, txManager, ctx),
      new UnpublishHotsiteUseCase(repo, tenantRepo, frontendRevalidation, txManager, ctx),
      new GenerateHotsiteImageSignedUrlUseCase(ctx, storageService),
      new FeatureBookingPhotoUseCase(ctx, bookingLookup, storageService),
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

    it('maps PlatformDomainError to 400 when seo.title exceeds 70 characters', async () => {
      const config = new HotsiteConfigBuilder().withTenantId(TENANT_A).buildWithContent();
      await repo.save(config);

      const err = await controller
        .updateContent({ seo: { title: 'a'.repeat(71) } })
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
    it('returns a tenant-scoped filePath, signedUrl, and expiresAt', async () => {
      const result = await controller.generateImageSignedUrl({
        fileName: 'logo.png',
        contentType: 'image/png',
        purpose: 'branding',
      });

      expect(result.filePath.startsWith(`tenants/${TENANT_A}/hotsite/branding/`)).toBe(true);
      expect(result.signedUrl).toContain(result.filePath);
      expect(result.expiresAt).toBe('2099-01-01T00:00:00.000Z');
    });
  });

  describe('featureBookingPhoto', () => {
    const BOOKING_ID = '20000000-0000-4000-8000-000000000001';
    const AFTER_PHOTO = `tenants/${TENANT_A}/bookings/${BOOKING_ID}/after-1.jpg`;

    it('copies the booking photo into the public bucket and returns filePath, url, photoType', async () => {
      bookingLookup.setBooking(TENANT_A, {
        id: BOOKING_ID,
        customerId: 'customer-1',
        beforeServicePhotoUrls: [],
        afterServicePhotoUrls: [AFTER_PHOTO],
      });

      const result = await controller.featureBookingPhoto({
        bookingId: BOOKING_ID,
        photoUrl: AFTER_PHOTO,
      });

      expect(result.photoType).toBe('after');
      expect(result.filePath.startsWith(`tenants/${TENANT_A}/hotsite/gallery/`)).toBe(true);
      expect(result.url).toBe(storageService.getPublicUrl(result.filePath));
    });

    it('maps FeaturedBookingNotFoundError to 404 when the booking does not exist', async () => {
      const err = await controller
        .featureBookingPhoto({ bookingId: BOOKING_ID, photoUrl: AFTER_PHOTO })
        .catch((e: unknown) => e);

      expect(err).toBeInstanceOf(HttpException);
      expect((err as HttpException).getStatus()).toBe(HttpStatus.NOT_FOUND);
    });

    it('maps PhotoNotOnBookingError to 400 when the photoUrl is on neither photo list', async () => {
      bookingLookup.setBooking(TENANT_A, {
        id: BOOKING_ID,
        customerId: 'customer-1',
        beforeServicePhotoUrls: [],
        afterServicePhotoUrls: [AFTER_PHOTO],
      });

      const err = await controller
        .featureBookingPhoto({
          bookingId: BOOKING_ID,
          photoUrl: `tenants/${TENANT_A}/bookings/${BOOKING_ID}/not-on-booking.jpg`,
        })
        .catch((e: unknown) => e);

      expect(err).toBeInstanceOf(HttpException);
      expect((err as HttpException).getStatus()).toBe(HttpStatus.BAD_REQUEST);
    });
  });
});
