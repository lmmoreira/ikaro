import { Inject, Injectable } from '@nestjs/common';
import { LeadFormModuleData } from '../../domain/hotsite-config.aggregate';
import { LeadFormAudienceMode, LeadFormQuestion } from '../../domain/lead-form-config.aggregate';
import { HotsiteContentReader } from '../services/hotsite-content-reader.service';
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
    private readonly hotsiteContentReader: HotsiteContentReader,
    @Inject(LEAD_FORM_CONFIG_REPOSITORY)
    private readonly leadFormConfigRepo: ILeadFormConfigRepository,
  ) {}

  async execute(input: GetLeadFormConfigUseCaseInput): Promise<GetLeadFormConfigUseCaseResult> {
    const { tenantId } = input;
    // readResolved() resolves every stored image path (including this module's own
    // backgroundImageUrl) to a permanent public URL — symmetric with
    // UpdateLeadFormModuleUseCase's own resolution on the write side, same reasoning as
    // GetHotsiteContentUseCase (docs/ENGINEERING_RULES.md: a raw storage path here would show a
    // broken image once the environment's public base URL doesn't bake the bucket name in).
    const content = await this.hotsiteContentReader.readResolved(tenantId);

    const leadFormModule = content.layout.find((module) => module.type === 'LEAD_FORM');
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
