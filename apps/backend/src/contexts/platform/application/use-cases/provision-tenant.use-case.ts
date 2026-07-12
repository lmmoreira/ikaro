import { Inject, Injectable } from '@nestjs/common';
import { uuidv7 } from '../../../../shared/domain/uuid-v7';
import {
  ITransactionManager,
  TRANSACTION_MANAGER,
} from '../../../../shared/ports/transaction-manager.port';
import { CountryCode } from '../../../../shared/value-objects/country-code.vo';
import { HotsiteConfig } from '../../domain/hotsite-config.aggregate';
import { SlugAlreadyTakenError } from '../../domain/errors/platform-domain.error';
import { Tenant } from '../../domain/tenant.aggregate';
import {
  HOTSITE_CONFIG_REPOSITORY,
  IHotsiteConfigRepository,
} from '../ports/hotsite-config-repository.port';
import { ITenantRepository, TENANT_REPOSITORY } from '../ports/tenant-repository.port';
import { ProvisionTenantDto } from '../dtos/provision-tenant.dto';

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

  async execute(dto: ProvisionTenantDto): Promise<ProvisionTenantUseCaseResult> {
    const countryCode = CountryCode.create(dto.country_code);
    const timezone = dto.timezone ?? countryCode.spec.defaultTimezone;
    // correlationId generated here — /internal routes skip RequestInterceptor
    const correlationId = uuidv7();

    if (await this.tenantRepo.existsBySlug(dto.slug)) {
      throw new SlugAlreadyTakenError(dto.slug);
    }

    const tenant = Tenant.create(
      dto.name,
      dto.slug,
      dto.adminEmail,
      correlationId,
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
