import { InMemoryStorageService } from '../../../../test/infrastructure/in-memory-storage.service';
import { HotsiteImageNotUploadedError } from '../../domain/errors/platform-domain.error';
import {
  DEFAULT_HOTSITE_BRANDING,
  DEFAULT_HOTSITE_SEO,
  HotsiteModule,
} from '../../domain/hotsite-config.aggregate';
import { HotsiteImagePathsService } from '../../domain/services/hotsite-image-paths.service';
import { HotsiteImagePromotionService } from './hotsite-image-promotion.service';

const TENANT_A = '10000000-0000-4000-8000-000000000001';
const TENANT_B = '10000000-0000-4000-8000-000000000002';

describe('HotsiteImagePromotionService', () => {
  let storageService: InMemoryStorageService;
  let service: HotsiteImagePromotionService;

  beforeEach(() => {
    storageService = new InMemoryStorageService();
    service = new HotsiteImagePromotionService(storageService, new HotsiteImagePathsService());
  });

  describe('prepareImagePromotion()', () => {
    it('promotes a tmp/ logoUrl to its permanent path and returns the rewritten branding', async () => {
      const tmpPath = `tmp/${TENANT_A}/branding/u1/logo.png`;
      storageService.markAsUploaded(tmpPath);
      const branding = { ...DEFAULT_HOTSITE_BRANDING, logoUrl: tmpPath };

      const result = await service.prepareImagePromotion(
        branding,
        [],
        DEFAULT_HOTSITE_SEO,
        TENANT_A,
      );

      const expectedPermanentPath = `tenants/${TENANT_A}/hotsite/branding/u1/logo.png`;
      expect(result.branding.logoUrl).toBe(expectedPermanentPath);
      expect(result.promotions).toEqual([{ from: tmpPath, to: expectedPermanentPath }]);
    });

    it('validates an already-permanent path exists, without adding it to promotions', async () => {
      const permanentPath = `tenants/${TENANT_A}/hotsite/branding/u1/logo.png`;
      storageService.markAsUploaded(permanentPath);
      const branding = { ...DEFAULT_HOTSITE_BRANDING, logoUrl: permanentPath };

      const result = await service.prepareImagePromotion(
        branding,
        [],
        DEFAULT_HOTSITE_SEO,
        TENANT_A,
      );

      expect(result.branding.logoUrl).toBe(permanentPath);
      expect(result.promotions).toEqual([]);
    });

    it('rejects a cross-tenant tmp/ path instead of promoting it', async () => {
      const otherTenantTmpPath = `tmp/${TENANT_B}/branding/u1/logo.png`;
      storageService.markAsUploaded(otherTenantTmpPath);
      const branding = { ...DEFAULT_HOTSITE_BRANDING, logoUrl: otherTenantTmpPath };

      await expect(
        service.prepareImagePromotion(branding, [], DEFAULT_HOTSITE_SEO, TENANT_A),
      ).rejects.toBeInstanceOf(HotsiteImageNotUploadedError);
    });

    describe('nested image slots', () => {
      const aboutWith = (presentation: object): HotsiteModule[] => [
        {
          type: 'ABOUT',
          enabled: true,
          data: { title: 'T', body: 'B', imagePosition: 'left' },
          presentation,
        } as HotsiteModule,
      ];
      const collage = (urls: string[]): HotsiteModule[] => [
        {
          type: 'CONTENT_BLOCK',
          enabled: true,
          data: {
            variant: 'collage-callout',
            title: 'T',
            images: urls.map((url) => ({ url })),
          },
        },
      ];

      it('promotes presentation.background.imageUrl and collage-callout images from tmp/', async () => {
        const background = `tmp/${TENANT_A}/section-background/u1/bg.jpg`;
        const collageImage = `tmp/${TENANT_A}/content-block/u2/a.jpg`;
        storageService.markAsUploaded(background);
        storageService.markAsUploaded(collageImage);
        const existing = `tenants/${TENANT_A}/hotsite/content-block/u3/b.jpg`;
        storageService.markAsUploaded(existing);

        const result = await service.prepareImagePromotion(
          DEFAULT_HOTSITE_BRANDING,
          [
            ...aboutWith({ background: { imageUrl: background } }),
            ...collage([collageImage, existing]),
          ],
          DEFAULT_HOTSITE_SEO,
          TENANT_A,
        );

        expect(result.promotions).toEqual([
          { from: background, to: `tenants/${TENANT_A}/hotsite/section-background/u1/bg.jpg` },
          { from: collageImage, to: `tenants/${TENANT_A}/hotsite/content-block/u2/a.jpg` },
        ]);
      });

      it("rejects another tenant's tmp/ path in presentation.background.imageUrl", async () => {
        const foreign = `tmp/${TENANT_B}/section-background/u1/bg.jpg`;
        storageService.markAsUploaded(foreign);

        await expect(
          service.prepareImagePromotion(
            DEFAULT_HOTSITE_BRANDING,
            aboutWith({ background: { imageUrl: foreign } }),
            DEFAULT_HOTSITE_SEO,
            TENANT_A,
          ),
        ).rejects.toBeInstanceOf(HotsiteImageNotUploadedError);
      });

      it("rejects another tenant's tmp/ path in a collage-callout image", async () => {
        const foreign = `tmp/${TENANT_B}/content-block/u1/a.jpg`;
        storageService.markAsUploaded(foreign);

        await expect(
          service.prepareImagePromotion(
            DEFAULT_HOTSITE_BRANDING,
            collage([foreign, `tenants/${TENANT_A}/hotsite/content-block/u2/b.jpg`]),
            DEFAULT_HOTSITE_SEO,
            TENANT_A,
          ),
        ).rejects.toBeInstanceOf(HotsiteImageNotUploadedError);
      });

      it('rejects a shared templates/ path until the template catalogue exists', async () => {
        await expect(
          service.prepareImagePromotion(
            DEFAULT_HOTSITE_BRANDING,
            aboutWith({ background: { imageUrl: 'templates/casa47/v1/hero.jpg' } }),
            DEFAULT_HOTSITE_SEO,
            TENANT_A,
          ),
        ).rejects.toBeInstanceOf(HotsiteImageNotUploadedError);
      });

      it('deletes a superseded permanent presentation background but never a path outside the tenant', () => {
        const mine = `tenants/${TENANT_A}/hotsite/section-background/u1/old.jpg`;
        const shared = 'templates/casa47/v1/hero.jpg';

        const deletions = service.computeDeletions(
          [mine, shared],
          DEFAULT_HOTSITE_BRANDING,
          aboutWith({ background: { imageUrl: null } }),
          DEFAULT_HOTSITE_SEO,
          TENANT_A,
        );

        expect(deletions).toEqual([mine]);
      });
    });

    it('rejects a tmp/ path for an object that was never actually uploaded', async () => {
      const branding = {
        ...DEFAULT_HOTSITE_BRANDING,
        logoUrl: `tmp/${TENANT_A}/branding/u1/missing.png`,
      };

      await expect(
        service.prepareImagePromotion(branding, [], DEFAULT_HOTSITE_SEO, TENANT_A),
      ).rejects.toBeInstanceOf(HotsiteImageNotUploadedError);
    });

    it('rejects a permanent path that does not exist in the public bucket', async () => {
      const branding = {
        ...DEFAULT_HOTSITE_BRANDING,
        logoUrl: `tenants/${TENANT_A}/hotsite/branding/u1/missing.png`,
      };

      await expect(
        service.prepareImagePromotion(branding, [], DEFAULT_HOTSITE_SEO, TENANT_A),
      ).rejects.toBeInstanceOf(HotsiteImageNotUploadedError);
    });

    it('tenant isolation: rejects an already-permanent path belonging to another tenant, even if it exists', async () => {
      const otherTenantPath = `tenants/${TENANT_B}/hotsite/branding/u1/logo.png`;
      storageService.markAsUploaded(otherTenantPath);
      const branding = { ...DEFAULT_HOTSITE_BRANDING, logoUrl: otherTenantPath };

      await expect(
        service.prepareImagePromotion(branding, [], DEFAULT_HOTSITE_SEO, TENANT_A),
      ).rejects.toBeInstanceOf(HotsiteImageNotUploadedError);
    });

    it('promotes a HERO backgroundImageUrl the same way as branding.logoUrl', async () => {
      const tmpPath = `tmp/${TENANT_A}/hero/u1/bg.jpg`;
      storageService.markAsUploaded(tmpPath);
      const layout: HotsiteModule[] = [
        {
          type: 'HERO',
          enabled: true,
          data: {
            variant: 'centered',
            title: 'Title',
            ctaLabel: 'Book',
            ctaTarget: 'booking-form',
            backgroundImageUrl: tmpPath,
          },
        },
      ];

      const result = await service.prepareImagePromotion(
        DEFAULT_HOTSITE_BRANDING,
        layout,
        DEFAULT_HOTSITE_SEO,
        TENANT_A,
      );

      const data = result.layout[0]!.data as unknown as { backgroundImageUrl: string };
      expect(data.backgroundImageUrl).toBe(`tenants/${TENANT_A}/hotsite/hero/u1/bg.jpg`);
    });

    it('promotes a tmp/ seo.ogImageUrl to its permanent path, same as branding.logoUrl', async () => {
      const tmpPath = `tmp/${TENANT_A}/seo-og-image/u1/og-image.png`;
      storageService.markAsUploaded(tmpPath);
      const seo = { ...DEFAULT_HOTSITE_SEO, ogImageUrl: tmpPath };

      const result = await service.prepareImagePromotion(
        DEFAULT_HOTSITE_BRANDING,
        [],
        seo,
        TENANT_A,
      );

      const expectedPermanentPath = `tenants/${TENANT_A}/hotsite/seo-og-image/u1/og-image.png`;
      expect(result.seo.ogImageUrl).toBe(expectedPermanentPath);
      expect(result.promotions).toEqual([{ from: tmpPath, to: expectedPermanentPath }]);
    });
  });

  describe('executeImagePromotion()', () => {
    it('copies each promotion to its public permanent path and deletes the tmp source', async () => {
      storageService.markAsUploaded(`tmp/${TENANT_A}/branding/u1/logo.png`);
      const promotions = [
        {
          from: `tmp/${TENANT_A}/branding/u1/logo.png`,
          to: `tenants/${TENANT_A}/hotsite/branding/u1/logo.png`,
        },
      ];

      await service.executeImagePromotion(promotions, []);

      expect(storageService.copiedPaths).toEqual([
        {
          sourcePath: promotions[0].from,
          destinationPath: promotions[0].to,
          destinationBucket: 'public',
        },
      ]);
      expect(storageService.deletedPaths).toContain(promotions[0].from);
    });

    it('deletes every path in deletions from the public bucket', async () => {
      const oldPath = `tenants/${TENANT_A}/hotsite/branding/old/logo.png`;
      storageService.markAsUploaded(oldPath);

      await service.executeImagePromotion([], [oldPath]);

      expect(storageService.deletedPaths).toContain(oldPath);
    });

    it('is best-effort — a failure on one operation does not stop the rest', async () => {
      const copySpy = jest
        .spyOn(storageService, 'copy')
        .mockRejectedValueOnce(new Error('boom'))
        .mockResolvedValueOnce(undefined);
      const promotions = [
        { from: 'tmp/tenant-a/u1/a.png', to: `tenants/${TENANT_A}/hotsite/branding/u1/a.png` },
        { from: 'tmp/tenant-a/u2/b.png', to: `tenants/${TENANT_A}/hotsite/branding/u2/b.png` },
      ];

      await expect(service.executeImagePromotion(promotions, [])).resolves.toBeUndefined();
      expect(copySpy).toHaveBeenCalledTimes(2);
    });

    it('resolves without doing anything for empty promotions and deletions', async () => {
      await expect(service.executeImagePromotion([], [])).resolves.toBeUndefined();
    });
  });
});
