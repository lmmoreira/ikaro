import { Inject, Injectable } from '@nestjs/common';
import { HotsiteNotFoundError } from '../../domain/errors/platform-domain.error';
import {
  HOTSITE_CONFIG_REPOSITORY,
  IHotsiteConfigRepository,
} from '../ports/hotsite-config-repository.port';

export interface GetLeadFormStatusUseCaseInput {
  tenantId: string;
}

export interface GetLeadFormStatusUseCaseResult {
  enabled: boolean;
}

/** Nav-gating read (UC-041 Trigger) — thin read of HotsiteConfig's own layout[].enabled flag. */
@Injectable()
export class GetLeadFormStatusUseCase {
  constructor(
    @Inject(HOTSITE_CONFIG_REPOSITORY)
    private readonly hotsiteConfigRepo: IHotsiteConfigRepository,
  ) {}

  async execute(input: GetLeadFormStatusUseCaseInput): Promise<GetLeadFormStatusUseCaseResult> {
    const { tenantId } = input;
    const hotsiteConfig = await this.hotsiteConfigRepo.findByTenantId(tenantId);
    if (!hotsiteConfig) throw new HotsiteNotFoundError(tenantId);
    const leadFormModule = hotsiteConfig.layout.find((module) => module.type === 'LEAD_FORM');
    return { enabled: leadFormModule?.enabled ?? false };
  }
}
