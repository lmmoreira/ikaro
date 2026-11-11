import { Inject, Injectable } from '@nestjs/common';
import type { FeatureKey } from '@ikaro/validation';
import { uuidv7 } from '../../../../shared/domain/uuid-v7';
import {
  ITransactionManager,
  TRANSACTION_MANAGER,
} from '../../../../shared/ports/transaction-manager.port';
import { CountryCode } from '../../../../shared/value-objects/country-code.vo';
import { TaxId } from '../../../../shared/value-objects/tax-id.vo';
import { HotsiteConfig } from '../../domain/hotsite-config.aggregate';
import { SlugAlreadyTakenError } from '../../domain/errors/platform-domain.error';
import { TenantBillingHint } from '../../domain/events/tenant-provisioned.event';
import { Tenant } from '../../domain/tenant.aggregate';
import {
  HOTSITE_CONFIG_REPOSITORY,
  IHotsiteConfigRepository,
} from '../ports/hotsite-config-repository.port';
import { ITenantRepository, TENANT_REPOSITORY } from '../ports/tenant-repository.port';

export interface ProvisionTenantUseCaseInput {
  name: string;
  slug: string;
  adminEmail: string;
  country_code: string;
  timezone?: string;
  /** Free access, never charged (UC-137). */
  exempt?: boolean;
  /** The Billing provisioning registration (UC-110); its shape is checked at the boundary. */
  registrationId?: string;
  /** The explicit default paid-item subset (UC-110 A3); omitted means every feature. */
  features?: FeatureKey[];
  /** Raw CPF/CNPJ/EIN: validated, never persisted or put on the event. */
  taxId?: string;
}

// The hint is only worth publishing when the caller asked Billing for something.
function billingHintOf(input: ProvisionTenantUseCaseInput): TenantBillingHint | undefined {
  if (!input.exempt && !input.features && !input.registrationId) return undefined;
  return {
    exempt: input.exempt === true,
    ...(input.features ? { features: input.features } : {}),
    ...(input.registrationId ? { registrationId: input.registrationId } : {}),
  };
}

export interface ProvisionTenantUseCaseResult {
  tenantId: string;
  name: string;
  slug: string;
}

@Injectable()
export class ProvisionTenantUseCase {
  constructor(
    @Inject(TENANT_REPOSITORY) private readonly tenantRepo: ITenantRepository,
    @Inject(HOTSITE_CONFIG_REPOSITORY) private readonly hotsiteRepo: IHotsiteConfigRepository,
    @Inject(TRANSACTION_MANAGER) private readonly txManager: ITransactionManager,
  ) {}

  async execute(input: ProvisionTenantUseCaseInput): Promise<ProvisionTenantUseCaseResult> {
    const countryCode = CountryCode.create(input.country_code);
    const timezone = input.timezone ?? countryCode.spec.defaultTimezone;
    // correlationId generated here — /internal routes skip RequestInterceptor
    const correlationId = uuidv7();

    if (await this.tenantRepo.existsBySlug(input.slug)) {
      throw new SlugAlreadyTakenError(input.slug);
    }

    // The tax id is validated here and goes nowhere else: the registration holds it (UC-024).
    // A non-exempt tenant needs one where the country requires it; an exempt one never does, but a
    // value it does send is still checked.
    if (!input.exempt || input.taxId?.trim()) {
      TaxId.createOptional(input.taxId, countryCode.spec.taxId);
    }

    const tenant = Tenant.create(
      input.name,
      input.slug,
      input.adminEmail,
      correlationId,
      timezone,
      countryCode.value,
      billingHintOf(input),
    );
    const config = HotsiteConfig.create(tenant.id);

    await this.txManager.run(async () => {
      await this.tenantRepo.save(tenant);
      await this.hotsiteRepo.save(config);
    });

    return { tenantId: tenant.id, name: tenant.name, slug: tenant.slug.value };
  }
}
