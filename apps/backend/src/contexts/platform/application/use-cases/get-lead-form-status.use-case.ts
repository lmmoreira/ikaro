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

/**
 * Nav-gating read (UC-041 Trigger) — polled once per dashboard page load, so this goes through
 * IHotsiteConfigRepository.isModuleEnabled(), a narrow projection CachingHotsiteConfigRepository
 * caches independently of the full aggregate (M20-S10 follow-up).
 */
@Injectable()
export class GetLeadFormStatusUseCase {
  constructor(
    @Inject(HOTSITE_CONFIG_REPOSITORY)
    private readonly hotsiteConfigRepo: IHotsiteConfigRepository,
  ) {}

  async execute(input: GetLeadFormStatusUseCaseInput): Promise<GetLeadFormStatusUseCaseResult> {
    const { tenantId } = input;
    const enabled = await this.hotsiteConfigRepo.isModuleEnabled(tenantId, 'LEAD_FORM');
    if (enabled === null) throw new HotsiteNotFoundError(tenantId);
    return { enabled };
  }
}
