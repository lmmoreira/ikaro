import { ServiceBuilder } from '../../../../test/builders/booking/index';
import { InMemoryBookingPlatformPort } from '../../../../test/infrastructure/in-memory-booking-platform.port';
import { InMemoryStorageService } from '../../../../test/infrastructure/in-memory-storage.service';
import { InMemoryTransactionManager } from '../../../../test/infrastructure/in-memory-transaction-manager';
import { InMemoryServiceRepository } from '../../../../test/repositories/booking/in-memory-service.repository';
import {
  ServiceNotFoundError,
  ServicePublicProfileInvalidError,
} from '../../domain/errors/booking-domain.error';
import { ServicePublicProfile } from '../../domain/service-public-profile.vo';
import { ServiceImagePromotionService } from '../services/service-image-promotion.service';
import { UpdateServicePublicPageUseCase } from './update-service-public-page.use-case';

const TENANT_A = '10000000-0000-4000-8000-000000000001';
const TENANT_B = '10000000-0000-4000-8000-000000000002';
const PREFIX = `tenants/${TENANT_A}/hotsite/service-profile/`;

describe('UpdateServicePublicPageUseCase', () => {
  let serviceRepo: InMemoryServiceRepository;
  let bookingPlatform: InMemoryBookingPlatformPort;
  let storage: InMemoryStorageService;
  let txManager: InMemoryTransactionManager;
  let useCase: UpdateServicePublicPageUseCase;

  beforeEach(() => {
    serviceRepo = new InMemoryServiceRepository();
    bookingPlatform = new InMemoryBookingPlatformPort();
    storage = new InMemoryStorageService();
    txManager = new InMemoryTransactionManager();
    useCase = new UpdateServicePublicPageUseCase(
      serviceRepo,
      bookingPlatform,
      txManager,
      new ServiceImagePromotionService(storage),
      storage,
    );
  });

  describe('publishing', () => {
    it('publishes and generates the slug from the service name on the first publish', async () => {
      const service = new ServiceBuilder()
        .withTenantId(TENANT_A)
        .withName('Massagem Relaxante')
        .build();
      await serviceRepo.save(service);

      const result = await useCase.execute({ id: service.id, tenantId: TENANT_A, published: true });

      expect(result).toMatchObject({
        id: service.id,
        publicPagePublished: true,
        publicSlug: 'massagem-relaxante',
        publicProfile: null,
      });
      expect(bookingPlatform.revalidatedTenantIds).toEqual([TENANT_A]);
    });

    it('appends a piece of the service id when another service of the tenant holds the plain slug', async () => {
      const holder = new ServiceBuilder()
        .withTenantId(TENANT_A)
        .withName('Massagem')
        .withPublicSlug('massagem')
        .withPublicPagePublished(true)
        .build();
      const second = new ServiceBuilder().withTenantId(TENANT_A).withName('Massagem').build();
      await serviceRepo.save(holder);
      await serviceRepo.save(second);

      const result = await useCase.execute({ id: second.id, tenantId: TENANT_A, published: true });

      expect(result.publicSlug).toBe(`massagem-${second.id.slice(-6)}`);
    });

    it('gives the plain slug when the same name is only used in another tenant', async () => {
      const other = new ServiceBuilder()
        .withTenantId(TENANT_B)
        .withName('Massagem')
        .withPublicSlug('massagem')
        .withPublicPagePublished(true)
        .build();
      const mine = new ServiceBuilder().withTenantId(TENANT_A).withName('Massagem').build();
      await serviceRepo.save(other);
      await serviceRepo.save(mine);

      const result = await useCase.execute({ id: mine.id, tenantId: TENANT_A, published: true });

      expect(result.publicSlug).toBe('massagem');
    });

    it('keeps the slug through unpublish → rename → republish (the URL never changes)', async () => {
      const service = new ServiceBuilder().withTenantId(TENANT_A).withName('Massagem').build();
      await serviceRepo.save(service);

      await useCase.execute({ id: service.id, tenantId: TENANT_A, published: true });
      const unpublished = await useCase.execute({
        id: service.id,
        tenantId: TENANT_A,
        published: false,
      });
      service.update('Massagem Premium', null, service.price, 60, 5, false);
      const republished = await useCase.execute({
        id: service.id,
        tenantId: TENANT_A,
        published: true,
      });

      expect(unpublished.publicPagePublished).toBe(false);
      expect(unpublished.publicSlug).toBe('massagem');
      expect(republished.publicSlug).toBe('massagem');
    });

    it('lets an inactive service be published (the page can be prepared while it is off)', async () => {
      const service = new ServiceBuilder().withTenantId(TENANT_A).withIsActive(false).build();
      await serviceRepo.save(service);

      const result = await useCase.execute({ id: service.id, tenantId: TENANT_A, published: true });

      expect(result.publicPagePublished).toBe(true);
    });

    it('leaves the published flag alone when the request omits it', async () => {
      const service = new ServiceBuilder()
        .withTenantId(TENANT_A)
        .withPublicSlug('massagem')
        .withPublicPagePublished(true)
        .build();
      await serviceRepo.save(service);

      const result = await useCase.execute({
        id: service.id,
        tenantId: TENANT_A,
        profile: { longDescription: 'Texto' },
      });

      expect(result.publicPagePublished).toBe(true);
    });
  });

  describe('profile', () => {
    it('stores the profile; unpublishing keeps it', async () => {
      const service = new ServiceBuilder().withTenantId(TENANT_A).build();
      await serviceRepo.save(service);

      await useCase.execute({
        id: service.id,
        tenantId: TENANT_A,
        published: true,
        profile: { longDescription: 'Texto', inclusions: ['Chá'] },
      });
      const result = await useCase.execute({
        id: service.id,
        tenantId: TENANT_A,
        published: false,
      });

      expect(result.publicProfile).toMatchObject({ longDescription: 'Texto', inclusions: ['Chá'] });
    });

    it('clears the stored profile with null and deletes its now-orphaned images', async () => {
      const image = `${PREFIX}u1/a.webp`;
      storage.markAsUploaded(image);
      const service = new ServiceBuilder()
        .withTenantId(TENANT_A)
        .withPublicProfile(ServicePublicProfile.create({ coverImageUrl: image }))
        .build();
      await serviceRepo.save(service);

      const result = await useCase.execute({ id: service.id, tenantId: TENANT_A, profile: null });

      expect(result.publicProfile).toBeNull();
      expect(storage.deletedPaths).toContain(image);
    });

    it('rejects an invalid profile with a typed domain error and changes nothing', async () => {
      const service = new ServiceBuilder().withTenantId(TENANT_A).build();
      await serviceRepo.save(service);

      await expect(
        useCase.execute({
          id: service.id,
          tenantId: TENANT_A,
          published: true,
          profile: { inclusions: Array.from({ length: 13 }, () => 'x') },
        }),
      ).rejects.toBeInstanceOf(ServicePublicProfileInvalidError);

      expect((await serviceRepo.findById(service.id, TENANT_A))?.publicPagePublished).toBe(false);
    });
  });

  describe('images', () => {
    it('returns full public URLs while the aggregate keeps storing the paths', async () => {
      const path = `${PREFIX}u1/cover.webp`;
      const gallery = `${PREFIX}u2/a.webp`;
      storage.markAsUploaded(path);
      storage.markAsUploaded(gallery);
      const service = new ServiceBuilder().withTenantId(TENANT_A).build();
      await serviceRepo.save(service);

      const result = await useCase.execute({
        id: service.id,
        tenantId: TENANT_A,
        profile: { coverImageUrl: path, galleryImageUrls: [gallery] },
      });

      expect(result.publicProfile).toMatchObject({
        coverImageUrl: storage.getPublicUrl(path),
        galleryImageUrls: [storage.getPublicUrl(gallery)],
      });
      const stored = await serviceRepo.findById(service.id, TENANT_A);
      expect(stored?.publicProfile?.toJSON()).toMatchObject({
        coverImageUrl: path,
        galleryImageUrls: [gallery],
      });
    });

    it('still rejects a URL in the request body (the domain accepts storage paths only)', async () => {
      const service = new ServiceBuilder().withTenantId(TENANT_A).build();
      await serviceRepo.save(service);

      await expect(
        useCase.execute({
          id: service.id,
          tenantId: TENANT_A,
          profile: { coverImageUrl: storage.getPublicUrl(`${PREFIX}u1/cover.webp`) },
        }),
      ).rejects.toBeInstanceOf(ServicePublicProfileInvalidError);
    });

    it('promotes a tmp upload to its permanent path after the save, not before', async () => {
      const tmp = `tmp/${TENANT_A}/service-profile/u1/cover.webp`;
      storage.markAsUploaded(tmp);
      const service = new ServiceBuilder().withTenantId(TENANT_A).build();
      await serviceRepo.save(service);

      const result = await useCase.execute({
        id: service.id,
        tenantId: TENANT_A,
        profile: { coverImageUrl: tmp },
      });

      expect(result.publicProfile?.coverImageUrl).toBe(
        storage.getPublicUrl(`${PREFIX}u1/cover.webp`),
      );
      expect(storage.copiedPaths.map((c) => c.destinationPath)).toEqual([`${PREFIX}u1/cover.webp`]);
      expect(storage.deletedPaths).toContain(tmp);
    });

    it('checks storage outside the transaction (no network I/O inside txManager.run())', async () => {
      const tmp = `tmp/${TENANT_A}/service-profile/u1/cover.webp`;
      storage.markAsUploaded(tmp);
      const service = new ServiceBuilder().withTenantId(TENANT_A).build();
      await serviceRepo.save(service);
      const inTransactionDuringExists: boolean[] = [];
      const exists = storage.exists.bind(storage);
      jest.spyOn(storage, 'exists').mockImplementation((path, bucket) => {
        inTransactionDuringExists.push(txManager.isInTransaction);
        return exists(path, bucket);
      });

      await useCase.execute({
        id: service.id,
        tenantId: TENANT_A,
        profile: { coverImageUrl: tmp },
      });

      expect(inTransactionDuringExists).toEqual([false]);
    });

    it('moves nothing when the save fails', async () => {
      const tmp = `tmp/${TENANT_A}/service-profile/u1/cover.webp`;
      storage.markAsUploaded(tmp);
      const service = new ServiceBuilder().withTenantId(TENANT_A).build();
      await serviceRepo.save(service);
      jest.spyOn(serviceRepo, 'save').mockRejectedValueOnce(new Error('db down'));

      await expect(
        useCase.execute({ id: service.id, tenantId: TENANT_A, profile: { coverImageUrl: tmp } }),
      ).rejects.toThrow('db down');

      expect(storage.copiedPaths).toEqual([]);
      expect(storage.deletedPaths).toEqual([]);
    });

    it('deletes only the superseded service-profile images when the gallery changes', async () => {
      const kept = `${PREFIX}u1/kept.webp`;
      const dropped = `${PREFIX}u2/dropped.webp`;
      storage.markAsUploaded(kept);
      storage.markAsUploaded(dropped);
      const service = new ServiceBuilder()
        .withTenantId(TENANT_A)
        .withPublicProfile(ServicePublicProfile.create({ galleryImageUrls: [kept, dropped] }))
        .build();
      await serviceRepo.save(service);

      await useCase.execute({
        id: service.id,
        tenantId: TENANT_A,
        profile: { galleryImageUrls: [kept] },
      });

      expect(storage.deletedPaths).toEqual([dropped]);
    });
  });

  describe('tenant isolation', () => {
    it("answers not-found for another tenant's service", async () => {
      const service = new ServiceBuilder().withTenantId(TENANT_B).build();
      await serviceRepo.save(service);

      await expect(
        useCase.execute({ id: service.id, tenantId: TENANT_A, published: true }),
      ).rejects.toBeInstanceOf(ServiceNotFoundError);
      expect((await serviceRepo.findById(service.id, TENANT_B))?.publicPagePublished).toBe(false);
    });
  });
});
