import { Provider } from '@nestjs/common';
import { ServiceImagePromotionService } from './application/services/service-image-promotion.service';
import { GetPublicServiceBySlugUseCase } from './application/use-cases/get-public-service-by-slug.use-case';
import { GetServiceIntakeSchemaUseCase } from './application/use-cases/get-service-intake-schema.use-case';
import { PublishServiceIntakeSchemaUseCase } from './application/use-cases/publish-service-intake-schema.use-case';
import { UpdateServiceBookingPolicyUseCase } from './application/use-cases/update-service-booking-policy.use-case';
import { UpdateServiceLegsUseCase } from './application/use-cases/update-service-legs.use-case';
import { UpdateServicePublicPageUseCase } from './application/use-cases/update-service-public-page.use-case';
import { UpdateServiceResourceRequirementsUseCase } from './application/use-cases/update-service-resource-requirements.use-case';

// The service-configuration use cases — one per tab of the service editor (Recursos, Políticas de
// reserva, Formulário de reserva, Página pública) — and what the public page needs (the anonymous
// by-slug read and the image promotion). Split out of booking.module-providers.ts to keep that file
// under the file-length limit, like availabilityAlertMatchingProviders.
export const serviceConfigProviders: Provider[] = [
  UpdateServiceResourceRequirementsUseCase,
  UpdateServiceLegsUseCase,
  UpdateServiceBookingPolicyUseCase,
  PublishServiceIntakeSchemaUseCase,
  GetServiceIntakeSchemaUseCase,
  UpdateServicePublicPageUseCase,
  GetPublicServiceBySlugUseCase,
  ServiceImagePromotionService,
];
