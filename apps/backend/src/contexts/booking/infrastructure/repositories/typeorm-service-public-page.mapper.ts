import { Service } from '../../domain/service.aggregate';
import { ServicePublicProfile } from '../../domain/service-public-profile.vo';
import { ServicePublicSlug } from '../../domain/service-public-slug.vo';
import { ServiceProps } from '../../domain/service.types';
import { ServiceEntity } from '../entities/service.entity';

// TD56-S03 — the public-page field group, split out like typeorm-service-booking-policy.mapper.ts
// so typeorm-service.mapper.ts stays under the file-length limit.

export function toPublicPage(
  entity: ServiceEntity,
): Pick<ServiceProps, 'publicPagePublished' | 'publicSlug' | 'publicProfile'> {
  return {
    publicPagePublished: entity.publicPagePublished,
    publicSlug:
      entity.publicSlug === null ? null : ServicePublicSlug.reconstitute(entity.publicSlug),
    publicProfile:
      entity.publicProfile === null
        ? null
        : ServicePublicProfile.reconstitute(entity.publicProfile),
  };
}

export function applyPublicPage(entity: ServiceEntity, service: Service): void {
  entity.publicPagePublished = service.publicPagePublished;
  entity.publicSlug = service.publicSlug?.value ?? null;
  entity.publicProfile = service.publicProfile?.toJSON() ?? null;
}
