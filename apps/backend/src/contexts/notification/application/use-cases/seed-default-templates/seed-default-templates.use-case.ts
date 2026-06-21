import { Inject, Injectable } from '@nestjs/common';
import {
  INotificationTemplateRepository,
  NOTIFICATION_TEMPLATE_REPOSITORY,
} from '../../ports/notification-template-repository.port';
import {
  INotificationPlatformPort,
  NOTIFICATION_PLATFORM_PORT,
} from '../../ports/notification-platform.port';

export interface SeedDefaultTemplatesDto {
  tenantId: string;
}

export interface SeedDefaultTemplatesUseCaseResult {
  seeded: number;
}

const DEFAULT_LOCALE = 'pt-BR';

@Injectable()
export class SeedDefaultTemplatesUseCase {
  constructor(
    @Inject(NOTIFICATION_TEMPLATE_REPOSITORY)
    private readonly templateRepo: INotificationTemplateRepository,
    @Inject(NOTIFICATION_PLATFORM_PORT)
    private readonly platformPort: INotificationPlatformPort,
  ) {}

  async execute(dto: SeedDefaultTemplatesDto): Promise<SeedDefaultTemplatesUseCaseResult> {
    const tenantInfo = await this.platformPort.getTenantInfo(dto.tenantId);
    const locale = tenantInfo?.locale ?? DEFAULT_LOCALE;
    const seeded = await this.templateRepo.copyGlobalDefaultsForTenant(dto.tenantId, locale);
    return { seeded };
  }
}
