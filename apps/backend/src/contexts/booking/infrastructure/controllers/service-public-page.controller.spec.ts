import { HttpException, HttpStatus } from '@nestjs/common';
import { ServiceBuilder } from '../../../../test/builders/booking/index';
import { RequestContextBuilder } from '../../../../test/factories/request-context.factory';
import { InMemoryBookingPlatformPort } from '../../../../test/infrastructure/in-memory-booking-platform.port';
import { InMemoryStorageService } from '../../../../test/infrastructure/in-memory-storage.service';
import { InMemoryTransactionManager } from '../../../../test/infrastructure/in-memory-transaction-manager';
import { InMemoryServiceRepository } from '../../../../test/repositories/booking/in-memory-service.repository';
import { ServiceImagePromotionService } from '../../application/services/service-image-promotion.service';
import { UpdateServicePublicPageUseCase } from '../../application/use-cases/update-service-public-page.use-case';
import { ServicePublicSlugTakenError } from '../../domain/errors/booking-domain.error';
import { ServicePublicPageController } from './service-public-page.controller';

const TENANT_A = '10000000-0000-4000-8000-0000000029c2';
const UNKNOWN_ID = '20000000-0000-4000-8000-0000000000aa';

describe('ServicePublicPageController (TD56-S03, UC-013 A5)', () => {
  let controller: ServicePublicPageController;
  let repo: InMemoryServiceRepository;

  beforeEach(() => {
    repo = new InMemoryServiceRepository();
    controller = new ServicePublicPageController(
      new RequestContextBuilder().withTenantId(TENANT_A).build(),
      new UpdateServicePublicPageUseCase(
        repo,
        new InMemoryBookingPlatformPort(),
        new InMemoryTransactionManager(),
        new ServiceImagePromotionService(new InMemoryStorageService()),
        new InMemoryStorageService(),
      ),
    );
  });

  it('publishes the page, generates the slug and returns the stored profile', async () => {
    const service = new ServiceBuilder()
      .withTenantId(TENANT_A)
      .withName('Massagem Relaxante')
      .build();
    await repo.save(service);

    const result = await controller.update(service.id, {
      published: true,
      profile: { longDescription: 'Uma pausa.', inclusions: ['Chá'] },
    });

    expect(result).toMatchObject({
      id: service.id,
      publicPagePublished: true,
      publicSlug: 'massagem-relaxante',
      publicProfile: { longDescription: 'Uma pausa.', inclusions: ['Chá'] },
    });
  });

  it('unpublishes while keeping the slug and the profile', async () => {
    const service = new ServiceBuilder().withTenantId(TENANT_A).withName('Massagem').build();
    await repo.save(service);
    await controller.update(service.id, { published: true, profile: { longDescription: 'Texto' } });

    const result = await controller.update(service.id, { published: false });

    expect(result).toMatchObject({
      publicPagePublished: false,
      publicSlug: 'massagem',
      publicProfile: { longDescription: 'Texto' },
    });
  });

  it('maps an unknown service to 404', async () => {
    const err = await controller.update(UNKNOWN_ID, { published: true }).catch((e: unknown) => e);

    expect((err as HttpException).getStatus()).toBe(HttpStatus.NOT_FOUND);
  });

  it("maps another tenant's service to 404 (tenant isolation)", async () => {
    const other = new ServiceBuilder()
      .withTenantId('10000000-0000-4000-8000-0000000029c3')
      .withName('Massagem')
      .build();
    await repo.save(other);

    const err = await controller.update(other.id, { published: true }).catch((e: unknown) => e);

    expect((err as HttpException).getStatus()).toBe(HttpStatus.NOT_FOUND);
    expect((await repo.findById(other.id, other.tenantId))?.publicPagePublished).toBe(false);
  });

  it('maps an invalid profile (an image that was never uploaded) to 400', async () => {
    const service = new ServiceBuilder().withTenantId(TENANT_A).build();
    await repo.save(service);

    const err = await controller
      .update(service.id, {
        profile: { coverImageUrl: `tmp/${TENANT_A}/service-profile/u/missing.webp` },
      })
      .catch((e: unknown) => e);

    expect((err as HttpException).getStatus()).toBe(HttpStatus.BAD_REQUEST);
  });

  it('maps the simultaneous-first-publish clash to a retryable 409', async () => {
    const service = new ServiceBuilder().withTenantId(TENANT_A).build();
    await repo.save(service);
    jest.spyOn(repo, 'save').mockRejectedValueOnce(new ServicePublicSlugTakenError());

    const err = await controller.update(service.id, { published: true }).catch((e: unknown) => e);

    expect((err as HttpException).getStatus()).toBe(HttpStatus.CONFLICT);
  });
});
