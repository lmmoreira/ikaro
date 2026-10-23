import { Inject, Injectable } from '@nestjs/common';
import { AppLogger } from '../../../../shared/observability/app-logger';
import { IStorageService, STORAGE_SERVICE } from '../../../../shared/ports/storage.service.port';
import {
  executeTenantImagePromotion,
  ImagePromotionOperation,
  prepareTenantImagePromotion,
} from '../../../../shared/utils/tenant-image-promotion';
import { ServicePublicProfileInvalidError } from '../../domain/errors/booking-domain.error';
import { ServicePublicProfile } from '../../domain/service-public-profile.vo';

const SERVICE_PROFILE_PURPOSE = 'service-profile';

export interface PreparedServiceImagePromotion {
  profile: ServicePublicProfile;
  promotions: ImagePromotionOperation[];
}

// The images of a service's public page live in the public bucket under
// tenants/<tenantId>/hotsite/service-profile/…, uploaded through the hotsite signed-url endpoint
// with the 'service-profile' purpose. The tmp → permanent rules are the shared ones (the hotsite
// save uses them too); what is Booking's own is which paths a profile may reference and which
// superseded objects it may delete — only its own prefix, so a service save can never remove a
// hotsite image and a hotsite save never sees a service one.
@Injectable()
export class ServiceImagePromotionService {
  private readonly logger = new AppLogger(ServiceImagePromotionService.name);

  constructor(@Inject(STORAGE_SERVICE) private readonly storageService: IStorageService) {}

  private permanentPrefix(tenantId: string): string {
    return `tenants/${tenantId}/hotsite/${SERVICE_PROFILE_PURPOSE}/`;
  }

  // Validation + path computation only — no storage is mutated, so it runs before the transaction
  // opens (the existence checks are network I/O and must stay out of txManager.run()).
  async prepare(
    profile: ServicePublicProfile,
    tenantId: string,
  ): Promise<PreparedServiceImagePromotion> {
    const results = await Promise.all(
      [...new Set(profile.imagePaths())].map((path) =>
        prepareTenantImagePromotion(this.storageService, path, tenantId, {
          permanentPrefix: this.permanentPrefix(tenantId),
          tmpPurpose: SERVICE_PROFILE_PURPOSE,
          invalidPathError: () => new ServicePublicProfileInvalidError('image-not-uploaded'),
        }),
      ),
    );
    const promotions = results.filter(
      (result): result is ImagePromotionOperation => result !== null,
    );
    const rewrite = new Map(promotions.map(({ from, to }) => [from, to]));
    return {
      profile:
        rewrite.size > 0 ? profile.mapImagePaths((path) => rewrite.get(path) ?? path) : profile,
      promotions,
    };
  }

  // A permanent service-profile image the stored profile referenced but the new one does not.
  computeDeletions(
    current: ServicePublicProfile | null,
    next: ServicePublicProfile | null,
    tenantId: string,
  ): string[] {
    const kept = new Set(next?.imagePaths() ?? []);
    const prefix = this.permanentPrefix(tenantId);
    return (current?.imagePaths() ?? []).filter(
      (path) => path.startsWith(prefix) && !kept.has(path),
    );
  }

  // Call via txManager.scheduleAfterCommit(), only once the service row is saved.
  execute(promotions: ImagePromotionOperation[], deletions: string[]): Promise<void> {
    return executeTenantImagePromotion(this.storageService, this.logger, promotions, deletions);
  }
}
