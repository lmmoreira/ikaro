import { InMemoryStorageService } from '../../../../test/infrastructure/in-memory-storage.service';
import { ServicePublicProfileInvalidError } from '../../domain/errors/booking-domain.error';
import { ServicePublicProfile } from '../../domain/service-public-profile.vo';
import { ServiceImagePromotionService } from './service-image-promotion.service';

const TENANT = '10000000-0000-4000-8000-000000000001';
const OTHER_TENANT = '10000000-0000-4000-8000-000000000002';
const PREFIX = `tenants/${TENANT}/hotsite/service-profile/`;

describe('ServiceImagePromotionService', () => {
  let storage: InMemoryStorageService;
  let service: ServiceImagePromotionService;

  beforeEach(() => {
    storage = new InMemoryStorageService();
    service = new ServiceImagePromotionService(storage);
  });

  describe('prepare()', () => {
    it('rewrites an uploaded service-profile tmp image to its permanent path', async () => {
      const tmp = `tmp/${TENANT}/service-profile/u1/cover.webp`;
      storage.markAsUploaded(tmp);

      const result = await service.prepare(
        ServicePublicProfile.create({ coverImageUrl: tmp }),
        TENANT,
      );

      expect(result.promotions).toEqual([{ from: tmp, to: `${PREFIX}u1/cover.webp` }]);
      expect(result.profile.coverImageUrl).toBe(`${PREFIX}u1/cover.webp`);
    });

    it('promotes a path used twice (cover and gallery) only once', async () => {
      const tmp = `tmp/${TENANT}/service-profile/u1/a.webp`;
      storage.markAsUploaded(tmp);

      const result = await service.prepare(
        ServicePublicProfile.create({ coverImageUrl: tmp, galleryImageUrls: [tmp] }),
        TENANT,
      );

      expect(result.promotions).toHaveLength(1);
      expect(result.profile.imagePaths()).toEqual([`${PREFIX}u1/a.webp`, `${PREFIX}u1/a.webp`]);
    });

    it('keeps an already-permanent service-profile image as is', async () => {
      const permanent = `${PREFIX}u1/a.webp`;
      storage.markAsUploaded(permanent);
      const profile = ServicePublicProfile.create({ galleryImageUrls: [permanent] });

      const result = await service.prepare(profile, TENANT);

      expect(result.promotions).toEqual([]);
      expect(result.profile).toBe(profile);
    });

    it.each([
      ['a foreign-tenant tmp path', `tmp/${OTHER_TENANT}/service-profile/u1/a.webp`],
      ['a booking-shaped tmp path', `tmp/${TENANT}/u1/photo.webp`],
      ['a tmp path of another purpose', `tmp/${TENANT}/gallery/u1/a.webp`],
      [
        'a hotsite image (not a service-profile path)',
        `tenants/${TENANT}/hotsite/gallery/u1/a.webp`,
      ],
      ['a tmp path that was never uploaded', `tmp/${TENANT}/service-profile/u9/missing.webp`],
    ])('rejects %s', async (_label, path) => {
      if (!path.endsWith('missing.webp')) storage.markAsUploaded(path);
      const profile = ServicePublicProfile.create({ coverImageUrl: path });

      await expect(service.prepare(profile, TENANT)).rejects.toBeInstanceOf(
        ServicePublicProfileInvalidError,
      );
    });
  });

  describe('computeDeletions()', () => {
    it('deletes only superseded service-profile images', () => {
      const kept = `${PREFIX}u1/kept.webp`;
      const dropped = `${PREFIX}u2/dropped.webp`;
      const current = ServicePublicProfile.create({
        coverImageUrl: kept,
        galleryImageUrls: [dropped],
      });
      const next = ServicePublicProfile.create({ coverImageUrl: kept });

      expect(service.computeDeletions(current, next, TENANT)).toEqual([dropped]);
    });

    it('deletes every image when the profile is cleared', () => {
      const image = `${PREFIX}u1/a.webp`;
      const current = ServicePublicProfile.create({ coverImageUrl: image });
      expect(service.computeDeletions(current, null, TENANT)).toEqual([image]);
    });

    it('never returns a path outside the service-profile prefix (a hotsite save and a service save cannot delete each other)', () => {
      const hotsiteImage = `tenants/${TENANT}/hotsite/gallery/u1/a.webp`;
      const foreign = `tenants/${OTHER_TENANT}/hotsite/service-profile/u1/a.webp`;
      const current = ServicePublicProfile.create({ galleryImageUrls: [hotsiteImage, foreign] });
      expect(service.computeDeletions(current, null, TENANT)).toEqual([]);
    });

    it('has nothing to delete without a stored profile', () => {
      expect(service.computeDeletions(null, ServicePublicProfile.create({}), TENANT)).toEqual([]);
    });
  });

  it('execute() copies promotions and deletes superseded objects', async () => {
    await service.execute(
      [{ from: `tmp/${TENANT}/service-profile/u1/a.webp`, to: `${PREFIX}u1/a.webp` }],
      [`${PREFIX}old.webp`],
    );
    expect(storage.copiedPaths).toHaveLength(1);
    expect(storage.deletedPaths).toContain(`${PREFIX}old.webp`);
  });
});
