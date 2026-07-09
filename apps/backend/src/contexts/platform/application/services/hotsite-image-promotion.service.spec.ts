import { InMemoryStorageService } from '../../../../test/infrastructure/in-memory-storage.service';
import { HotsiteImageNotUploadedError } from '../../domain/errors/platform-domain.error';
import { DEFAULT_HOTSITE_BRANDING, HotsiteModule } from '../../domain/hotsite-config.aggregate';
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

      const result = await service.prepareImagePromotion(branding, [], TENANT_A);

      const expectedPermanentPath = `tenants/${TENANT_A}/hotsite/branding/u1/logo.png`;
      expect(result.branding.logoUrl).toBe(expectedPermanentPath);
      expect(result.promotions).toEqual([{ from: tmpPath, to: expectedPermanentPath }]);
    });

    it('validates an already-permanent path exists, without adding it to promotions', async () => {
      const permanentPath = `tenants/${TENANT_A}/hotsite/branding/u1/logo.png`;
      storageService.markAsUploaded(permanentPath);
      const branding = { ...DEFAULT_HOTSITE_BRANDING, logoUrl: permanentPath };

      const result = await service.prepareImagePromotion(branding, [], TENANT_A);

      expect(result.branding.logoUrl).toBe(permanentPath);
      expect(result.promotions).toEqual([]);
    });

    it('rejects a cross-tenant tmp/ path instead of promoting it', async () => {
      const otherTenantTmpPath = `tmp/${TENANT_B}/branding/u1/logo.png`;
      storageService.markAsUploaded(otherTenantTmpPath);
      const branding = { ...DEFAULT_HOTSITE_BRANDING, logoUrl: otherTenantTmpPath };

      await expect(service.prepareImagePromotion(branding, [], TENANT_A)).rejects.toBeInstanceOf(
        HotsiteImageNotUploadedError,
      );
    });

    it('rejects a tmp/ path for an object that was never actually uploaded', async () => {
      const branding = {
        ...DEFAULT_HOTSITE_BRANDING,
        logoUrl: `tmp/${TENANT_A}/branding/u1/missing.png`,
      };

      await expect(service.prepareImagePromotion(branding, [], TENANT_A)).rejects.toBeInstanceOf(
        HotsiteImageNotUploadedError,
      );
    });

    it('rejects a permanent path that does not exist in the public bucket', async () => {
      const branding = {
        ...DEFAULT_HOTSITE_BRANDING,
        logoUrl: `tenants/${TENANT_A}/hotsite/branding/u1/missing.png`,
      };

      await expect(service.prepareImagePromotion(branding, [], TENANT_A)).rejects.toBeInstanceOf(
        HotsiteImageNotUploadedError,
      );
    });

    it('tenant isolation: rejects an already-permanent path belonging to another tenant, even if it exists', async () => {
      const otherTenantPath = `tenants/${TENANT_B}/hotsite/branding/u1/logo.png`;
      storageService.markAsUploaded(otherTenantPath);
      const branding = { ...DEFAULT_HOTSITE_BRANDING, logoUrl: otherTenantPath };

      await expect(service.prepareImagePromotion(branding, [], TENANT_A)).rejects.toBeInstanceOf(
        HotsiteImageNotUploadedError,
      );
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
        TENANT_A,
      );

      const data = result.layout[0]!.data as unknown as { backgroundImageUrl: string };
      expect(data.backgroundImageUrl).toBe(`tenants/${TENANT_A}/hotsite/hero/u1/bg.jpg`);
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
