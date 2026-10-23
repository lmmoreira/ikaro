import { Inject, Injectable } from '@nestjs/common';
import { ServiceNotFoundError } from '../../domain/errors/booking-domain.error';
import { ServicePublicProfileProps } from '../../domain/service-public-profile.vo';
import { IServiceRepository, SERVICE_REPOSITORY } from '../ports/service-repository.port';

export interface GetPublicServiceBySlugUseCaseInput {
  tenantId: string;
  publicSlug: string;
  locale: string;
}

// Profile-facing fields only — never the booking configuration (resources, legs, policy, intake):
// this is what an anonymous visitor may read.
export interface GetPublicServiceBySlugUseCaseResult {
  id: string;
  name: string;
  description: string | null;
  price: { amount: number; currency: string; formatted: string };
  durationMinutes: number;
  loyaltyPointsValue: number;
  // A customer-chosen duration has no fixed price or length to show on the page; the booking flow
  // quotes it. FIXED is every other service.
  durationPolicy: 'FIXED' | 'CUSTOMER_SELECTED';
  publicSlug: string;
  profile: ServicePublicProfileProps;
}

const EMPTY_PROFILE: ServicePublicProfileProps = {
  coverImageUrl: null,
  galleryImageUrls: [],
  longDescription: null,
  inclusions: [],
  preparationNotes: null,
};

// UC-109 step 1. A page that is unpublished, or whose service is inactive, does not exist for the
// visitor: the same 404 as an unknown slug, so nothing reveals which of those it was.
@Injectable()
export class GetPublicServiceBySlugUseCase {
  constructor(@Inject(SERVICE_REPOSITORY) private readonly serviceRepo: IServiceRepository) {}

  async execute(
    input: GetPublicServiceBySlugUseCaseInput,
  ): Promise<GetPublicServiceBySlugUseCaseResult> {
    const { tenantId, publicSlug, locale } = input;
    const service = await this.serviceRepo.findByPublicSlug(publicSlug, tenantId);
    if (!service?.publicSlug || !service.isActive || !service.publicPagePublished) {
      throw new ServiceNotFoundError(publicSlug);
    }
    return {
      id: service.id,
      name: service.name,
      description: service.description,
      price: {
        amount: service.price.amount.toNumber(),
        currency: service.price.currency,
        formatted: service.price.format(locale),
      },
      durationMinutes: service.durationMinutes,
      loyaltyPointsValue: service.loyaltyPointsValue,
      durationPolicy: service.bookingPolicy.durationPolicy,
      publicSlug: service.publicSlug.value,
      profile: service.publicProfile?.toJSON() ?? EMPTY_PROFILE,
    };
  }
}
