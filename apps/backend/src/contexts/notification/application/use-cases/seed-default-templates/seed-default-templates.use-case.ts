import { Inject, Injectable } from '@nestjs/common';
import {
  INotificationTemplateRepository,
  NOTIFICATION_TEMPLATE_REPOSITORY,
} from '../../ports/notification-template-repository.port';
import {
  INotificationPlatformPort,
  NOTIFICATION_PLATFORM_PORT,
} from '../../ports/notification-platform.port';
import { DEFAULT_LOCALE } from '../../../domain/notification-locale.constants';

export interface SeedDefaultTemplatesUseCaseInput {
  tenantId: string;
}

export interface SeedDefaultTemplatesUseCaseResult {
  seeded: number;
}

@Injectable()
export class SeedDefaultTemplatesUseCase {
  constructor(
    @Inject(NOTIFICATION_TEMPLATE_REPOSITORY)
    private readonly templateRepo: INotificationTemplateRepository,
    @Inject(NOTIFICATION_PLATFORM_PORT)
    private readonly platformPort: INotificationPlatformPort,
  ) {}

  async execute(
    input: SeedDefaultTemplatesUseCaseInput,
  ): Promise<SeedDefaultTemplatesUseCaseResult> {
    const tenantInfo = await this.platformPort.getTenantInfo(input.tenantId);
    const locale = tenantInfo?.locale ?? DEFAULT_LOCALE;
    const seeded = await this.templateRepo.copyGlobalDefaultsForTenant(input.tenantId, locale);
    return { seeded };
  }
}
