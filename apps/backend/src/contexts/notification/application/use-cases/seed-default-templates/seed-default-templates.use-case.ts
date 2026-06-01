import { Inject, Injectable } from '@nestjs/common';
import {
  INotificationTemplateRepository,
  NOTIFICATION_TEMPLATE_REPOSITORY,
} from '../../ports/notification-template-repository.port';

export interface SeedDefaultTemplatesDto {
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
  ) {}

  async execute(dto: SeedDefaultTemplatesDto): Promise<SeedDefaultTemplatesUseCaseResult> {
    const seeded = await this.templateRepo.copyGlobalDefaultsForTenant(dto.tenantId);
    return { seeded };
  }
}
