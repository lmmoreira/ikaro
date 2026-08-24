import { Inject, Injectable } from '@nestjs/common';
import { LeadFormModuleData } from '../../domain/hotsite-config.aggregate';
import { HotsiteNotFoundError } from '../../domain/errors/platform-domain.error';
import { LeadFormAudienceMode, LeadFormQuestion } from '../../domain/lead-form-config.aggregate';
import {
  HOTSITE_CONFIG_REPOSITORY,
  IHotsiteConfigRepository,
} from '../ports/hotsite-config-repository.port';
import {
  ILeadFormConfigRepository,
  LEAD_FORM_CONFIG_REPOSITORY,
} from '../ports/lead-form-config-repository.port';

// Default teaser data when no LEAD_FORM entry exists in HotsiteConfig.layout[] yet (every
// tenant, until the first manager save via UpdateLeadFormModuleUseCase) — mirrors BOOKING_CTA's
// own minimal default (apps/web/features/platform/hotsite/default-layout.ts), since
// LeadFormModuleData is the same shape family and shares its two required fields. Locked in
// during M20-S01 story-discovery, 2026-08-24 — there is no server-side "materialize on read"
// mechanism (materializeLayout() is a web-only, client-side helper that never persists).
export const DEFAULT_LEAD_FORM_MODULE_DATA: LeadFormModuleData = { title: '', ctaLabel: '' };

export interface GetLeadFormConfigUseCaseInput {
  tenantId: string;
}

export interface GetLeadFormConfigUseCaseResult extends LeadFormModuleData {
  audienceMode: LeadFormAudienceMode;
  questions: LeadFormQuestion[];
}

@Injectable()
export class GetLeadFormConfigUseCase {
  constructor(
    @Inject(HOTSITE_CONFIG_REPOSITORY)
    private readonly hotsiteConfigRepo: IHotsiteConfigRepository,
    @Inject(LEAD_FORM_CONFIG_REPOSITORY)
    private readonly leadFormConfigRepo: ILeadFormConfigRepository,
  ) {}

  async execute(input: GetLeadFormConfigUseCaseInput): Promise<GetLeadFormConfigUseCaseResult> {
    const { tenantId } = input;
    const hotsiteConfig = await this.hotsiteConfigRepo.findByTenantId(tenantId);
    if (!hotsiteConfig) throw new HotsiteNotFoundError(tenantId);

    const leadFormModule = hotsiteConfig.layout.find((module) => module.type === 'LEAD_FORM');
    const teaser =
      (leadFormModule?.data as LeadFormModuleData | undefined) ?? DEFAULT_LEAD_FORM_MODULE_DATA;

    const leadFormConfig = await this.leadFormConfigRepo.findByTenantId(tenantId);

    return {
      ...teaser,
      audienceMode: leadFormConfig?.audienceMode ?? 'GUEST_AND_CUSTOMER',
      questions: leadFormConfig?.questions ?? [],
    };
  }
}
