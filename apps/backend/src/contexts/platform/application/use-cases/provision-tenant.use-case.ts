import { Inject, Injectable } from '@nestjs/common';
import { uuidv7 } from '../../../../shared/domain/uuid-v7';
import {
  ITransactionManager,
  TRANSACTION_MANAGER,
} from '../../../../shared/ports/transaction-manager.port';
import { CountryCode } from '../../../../shared/value-objects/country-code.vo';
import { HotsiteConfig } from '../../domain/hotsite-config.aggregate';
import {
  SlugAlreadyTakenError,
  SlugReservedError,
} from '../../domain/errors/platform-domain.error';
import { SLUG_POLICY, SlugPolicy } from '../../domain/slug-policy';
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
  /**
   * The Billing registration reserved before the tenant (UC-024, UC-127). Required: every
   * provisioning goes through one pattern. Only its shape is checked at the boundary; Platform never
   * reads Billing, and the Billing handler refuses an unknown or already completed one (UC-110 A8).
   */
  registrationId: string;
  /**
   * Whether `PLATFORM_OWNER_TENANT_SLUG` may be provisioned (UC-024, UC-128). Required, no default:
   * only the operator controller passes `true`; self-signup passes `false`.
   */
  allowOwnerSlug: boolean;
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
    @Inject(SLUG_POLICY) private readonly slugPolicy: SlugPolicy,
  ) {}

  async execute(input: ProvisionTenantUseCaseInput): Promise<ProvisionTenantUseCaseResult> {
    const countryCode = CountryCode.create(input.country_code);
    const timezone = input.timezone ?? countryCode.spec.defaultTimezone;
    // correlationId generated here — /internal routes skip RequestInterceptor
    const correlationId = uuidv7();

    // The format stays the operator's own (`Slug.create` / the DTO, `400`); the policy adds only the
    // reserved word, so the operator path keeps its documented codes (UC-024 A2, A3, A9).
    const verdict = this.slugPolicy.validate(input.slug, { allowOwnerSlug: input.allowOwnerSlug });
    if (verdict.kind === 'reserved') throw new SlugReservedError(input.slug);

    if (await this.tenantRepo.existsBySlug(input.slug)) {
      throw new SlugAlreadyTakenError(input.slug);
    }

    const tenant = Tenant.create(
      input.name,
      input.slug,
      input.adminEmail,
      correlationId,
      input.registrationId,
      timezone,
      countryCode.value,
    );
    const config = HotsiteConfig.create(tenant.id);

    await this.txManager.run(async () => {
      await this.tenantRepo.save(tenant);
      await this.hotsiteRepo.save(config);
    });

    return { tenantId: tenant.id, name: tenant.name, slug: tenant.slug.value };
  }
}
