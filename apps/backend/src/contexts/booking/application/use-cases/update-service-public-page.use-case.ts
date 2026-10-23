import { Inject, Injectable } from '@nestjs/common';
import {
  ITransactionManager,
  TRANSACTION_MANAGER,
} from '../../../../shared/ports/transaction-manager.port';
import { ImagePromotionOperation } from '../../../../shared/utils/tenant-image-promotion';
import { ServiceNotFoundError } from '../../domain/errors/booking-domain.error';
import { Service } from '../../domain/service.aggregate';
import {
  ServicePublicProfile,
  ServicePublicProfileProps,
} from '../../domain/service-public-profile.vo';
import { ServicePublicSlug } from '../../domain/service-public-slug.vo';
import { UpdateServicePublicPageDto } from '../dtos/update-service-public-page.dto';
import { BOOKING_PLATFORM_PORT, IBookingPlatformPort } from '../ports/booking-platform.port';
import { IServiceRepository, SERVICE_REPOSITORY } from '../ports/service-repository.port';
import { ServiceImagePromotionService } from '../services/service-image-promotion.service';

export type UpdateServicePublicPageUseCaseInput = UpdateServicePublicPageDto & {
  id: string;
  tenantId: string;
};

export interface UpdateServicePublicPageUseCaseResult {
  id: string;
  publicPagePublished: boolean;
  publicSlug: string | null;
  publicProfile: ServicePublicProfileProps | null;
}

// How many trailing characters of the service id disambiguate a slug that is already taken. The
// last characters of a UUIDv7 are random; the leading ones are a millisecond timestamp and would
// repeat for services created close together.
const SLUG_SUFFIX_LENGTH = 6;

// UC-013 A5 (TD56-S03). Its own endpoint like the booking policy: the Página pública tab saves on
// its own, and an inactive service's page can still be prepared (Service.update() would reject it).
@Injectable()
export class UpdateServicePublicPageUseCase {
  constructor(
    @Inject(SERVICE_REPOSITORY) private readonly serviceRepo: IServiceRepository,
    @Inject(BOOKING_PLATFORM_PORT) private readonly bookingPlatform: IBookingPlatformPort,
    @Inject(TRANSACTION_MANAGER) private readonly txManager: ITransactionManager,
    private readonly imagePromotion: ServiceImagePromotionService,
  ) {}

  async execute(
    input: UpdateServicePublicPageUseCaseInput,
  ): Promise<UpdateServicePublicPageUseCaseResult> {
    const { id, tenantId, published } = input;

    // Validation and the storage existence checks come first: they are network I/O, so they stay
    // out of the transaction (txManager.run()), and they depend only on the request.
    const prepared = await this.prepareProfile(input);

    const service = await this.txManager.run(async () => {
      const current = await this.serviceRepo.findByIdForUpdate(id, tenantId);
      if (!current) throw new ServiceNotFoundError(id);

      let deletions: string[] = [];
      if (prepared !== undefined) {
        deletions = this.imagePromotion.computeDeletions(
          current.publicProfile,
          prepared?.profile ?? null,
          tenantId,
        );
        current.setPublicProfile(prepared?.profile ?? null);
      }
      if (published === true) current.publishPublicPage(await this.chooseSlug(current));
      if (published === false) current.unpublishPublicPage();

      await this.serviceRepo.save(current);
      await this.scheduleStorageWork(prepared?.promotions ?? [], deletions);
      return current;
    });

    await this.bookingPlatform.revalidatePublicPages(tenantId);

    return {
      id: service.id,
      publicPagePublished: service.publicPagePublished,
      publicSlug: service.publicSlug?.value ?? null,
      publicProfile: service.publicProfile?.toJSON() ?? null,
    };
  }

  // undefined = the request leaves the profile alone; null = clear it; otherwise validated and
  // with its tmp images resolved to their permanent paths.
  private async prepareProfile(
    input: UpdateServicePublicPageUseCaseInput,
  ): Promise<
    undefined | null | { profile: ServicePublicProfile; promotions: ImagePromotionOperation[] }
  > {
    if (input.profile === undefined) return undefined;
    if (input.profile === null) return null;
    return this.imagePromotion.prepare(ServicePublicProfile.create(input.profile), input.tenantId);
  }

  // First publish only (Service.publishPublicPage() ignores it once a slug exists): the name's
  // slug, or — when another service of the tenant already holds it — the name's slug plus a piece
  // of this service's id. The unique index is the final authority (see the repository).
  private async chooseSlug(service: Service): Promise<ServicePublicSlug> {
    if (service.publicSlug) return service.publicSlug;
    const plain = ServicePublicSlug.fromName(service.name);
    const holder = await this.serviceRepo.findByPublicSlug(plain.value, service.tenantId);
    if (!holder || holder.id === service.id) return plain;
    return ServicePublicSlug.fromName(service.name, service.id.slice(-SLUG_SUFFIX_LENGTH));
  }

  private async scheduleStorageWork(
    promotions: ImagePromotionOperation[],
    deletions: string[],
  ): Promise<void> {
    if (promotions.length === 0 && deletions.length === 0) return;
    await this.txManager.scheduleAfterCommit(() =>
      this.imagePromotion.execute(promotions, deletions),
    );
  }
}
