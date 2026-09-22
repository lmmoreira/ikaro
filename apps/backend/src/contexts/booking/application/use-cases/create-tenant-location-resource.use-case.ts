import { Inject, Injectable } from '@nestjs/common';
import { IInboxRepository, INBOX_REPOSITORY } from '../../../../shared/ports/inbox.port';
import {
  ITransactionManager,
  TRANSACTION_MANAGER,
} from '../../../../shared/ports/transaction-manager.port';
import { Resource } from '../../domain/resource.aggregate';
import { ResourceType } from '../../domain/resource.types';
import { BOOKING_PLATFORM_PORT, IBookingPlatformPort } from '../ports/booking-platform.port';
import { IResourceRepository, RESOURCE_REPOSITORY } from '../ports/resource-repository.port';

export interface CreateTenantLocationResourceUseCaseInput {
  tenantId: string;
  eventId: string;
  correlationId: string;
}

export interface CreateTenantLocationResourceUseCaseResult {
  resourceId: string;
}

// M21-S02 part 2: the going-forward counterpart of the historical backfill migration — keeps
// "every tenant always has exactly one active LOCATION resource" true for tenants provisioned
// after the migration ran. Named "Localização Principal" / "Main Location" per the tenant's
// locale — the same literal names the migration's own SQL uses (see
// 1748500000008-BackfillLocationResources.ts).
const LOCALIZED_LOCATION_NAME: Record<'en' | 'default', string> = {
  en: 'Main Location',
  default: 'Localização Principal',
};

function defaultLocationName(locale: string): string {
  return locale === 'en' ? LOCALIZED_LOCATION_NAME.en : LOCALIZED_LOCATION_NAME.default;
}

@Injectable()
export class CreateTenantLocationResourceUseCase {
  static readonly CONSUMER_NAME = 'create-tenant-location-resource';

  constructor(
    @Inject(RESOURCE_REPOSITORY) private readonly resourceRepo: IResourceRepository,
    @Inject(BOOKING_PLATFORM_PORT) private readonly platform: IBookingPlatformPort,
    @Inject(INBOX_REPOSITORY) private readonly inboxRepo: IInboxRepository,
    @Inject(TRANSACTION_MANAGER) private readonly txManager: ITransactionManager,
  ) {}

  async execute(
    input: CreateTenantLocationResourceUseCaseInput,
  ): Promise<CreateTenantLocationResourceUseCaseResult> {
    // correlationId isn't used here — no domain event is published (see class doc) — it's kept
    // on the input shape for symmetry with every other TenantProvisioned consumer's handler call.
    const { tenantId, eventId } = input;

    const existing = await this.resourceRepo.findByTenant(tenantId, {
      type: ResourceType.LOCATION,
      isActive: true,
    });
    if (existing.length > 0) return { resourceId: existing[0].id };

    const alreadyProcessed = await this.inboxRepo.hasBeenProcessed(
      eventId,
      CreateTenantLocationResourceUseCase.CONSUMER_NAME,
    );
    if (alreadyProcessed) {
      throw new Error(
        `TenantProvisioned ${eventId} already marked processed but no LOCATION resource found for tenant ${tenantId} — data inconsistency`,
      );
    }

    const { businessHours, locale } = await this.platform.getBusinessHoursAndLocale(tenantId);

    const resource = Resource.create({
      tenantId,
      type: ResourceType.LOCATION,
      name: defaultLocationName(locale),
      tenantBusinessHours: businessHours,
      workingHours: null,
      refId: null,
      maxCapacity: null,
      turnoverMinutes: 0,
    });

    await this.txManager.run(async () => {
      await this.resourceRepo.save(resource);
      await this.inboxRepo.markProcessed(
        eventId,
        CreateTenantLocationResourceUseCase.CONSUMER_NAME,
      );
    });

    return { resourceId: resource.id };
  }
}
