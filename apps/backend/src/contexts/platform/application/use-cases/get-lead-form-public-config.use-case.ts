import { Inject, Injectable } from '@nestjs/common';
import { LeadFormNotEnabledError } from '../../domain/errors/lead-form-domain.error';
import { LeadFormAudienceMode, LeadFormQuestion } from '../../domain/lead-form-config.aggregate';
import {
  HOTSITE_CONFIG_REPOSITORY,
  IHotsiteConfigRepository,
} from '../ports/hotsite-config-repository.port';
import {
  ILeadFormConfigRepository,
  LEAD_FORM_CONFIG_REPOSITORY,
} from '../ports/lead-form-config-repository.port';

export interface GetLeadFormPublicConfigUseCaseInput {
  tenantId: string;
}

export interface GetLeadFormPublicConfigUseCaseResult {
  audienceMode: LeadFormAudienceMode;
  questions: LeadFormQuestion[];
}

/**
 * Public/guest-reachable counterpart to GetLeadFormConfigUseCase (M20-S01, MANAGER-only) — never
 * returns the teaser fields that use case does, and 404s instead of defaulting when the module
 * isn't enabled (docs/14-API_CONTRACTS.md § Lead Form Widget).
 */
@Injectable()
export class GetLeadFormPublicConfigUseCase {
  constructor(
    @Inject(HOTSITE_CONFIG_REPOSITORY)
    private readonly hotsiteConfigRepo: IHotsiteConfigRepository,
    @Inject(LEAD_FORM_CONFIG_REPOSITORY)
    private readonly leadFormConfigRepo: ILeadFormConfigRepository,
  ) {}

  async execute(
    input: GetLeadFormPublicConfigUseCaseInput,
  ): Promise<GetLeadFormPublicConfigUseCaseResult> {
    const { tenantId } = input;

    const hotsiteConfig = await this.hotsiteConfigRepo.findByTenantId(tenantId);
    const leadFormModule = hotsiteConfig?.layout.find((module) => module.type === 'LEAD_FORM');
    if (!leadFormModule?.enabled) {
      throw new LeadFormNotEnabledError(tenantId);
    }

    const leadFormConfig = await this.leadFormConfigRepo.findByTenantId(tenantId);

    return {
      audienceMode: leadFormConfig?.audienceMode ?? 'GUEST_AND_CUSTOMER',
      questions: leadFormConfig?.questions ?? [],
    };
  }
}
