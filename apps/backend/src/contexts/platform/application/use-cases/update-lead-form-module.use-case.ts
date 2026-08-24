import { Inject, Injectable } from '@nestjs/common';
import {
  ITransactionManager,
  TRANSACTION_MANAGER,
} from '../../../../shared/ports/transaction-manager.port';
import { HotsiteModule, LeadFormModuleData } from '../../domain/hotsite-config.aggregate';
import {
  HotsiteNotFoundError,
  TenantNotFoundError,
} from '../../domain/errors/platform-domain.error';
import {
  LeadFormAudienceMode,
  LeadFormConfig,
  LeadFormQuestion,
} from '../../domain/lead-form-config.aggregate';
import {
  HOTSITE_CONFIG_REPOSITORY,
  IHotsiteConfigRepository,
} from '../ports/hotsite-config-repository.port';
import {
  ILeadFormConfigRepository,
  LEAD_FORM_CONFIG_REPOSITORY,
} from '../ports/lead-form-config-repository.port';
import { ITenantRepository, TENANT_REPOSITORY } from '../ports/tenant-repository.port';
import {
  DEFAULT_LEAD_FORM_MODULE_DATA,
  GetLeadFormConfigUseCaseResult,
} from './get-lead-form-config.use-case';

export interface UpdateLeadFormModuleUseCaseInput {
  tenantId: string;
  title?: string;
  subtitle?: string;
  eyebrow?: string;
  ctaLabel?: string;
  variant?: 'centered' | 'left-aligned';
  backgroundImageUrl?: string | null;
  backgroundImagePosition?: 'left' | 'center' | 'right';
  bgStyle?: 'primary' | 'background';
  audienceMode?: LeadFormAudienceMode;
  questions?: LeadFormQuestion[];
}

export type UpdateLeadFormModuleUseCaseResult = GetLeadFormConfigUseCaseResult;

type TeaserPatch = Omit<
  UpdateLeadFormModuleUseCaseInput,
  'tenantId' | 'audienceMode' | 'questions'
>;

/**
 * Cross-aggregate save, one transaction (docs/02-DOMAIN_MODEL.md § LeadFormConfig
 * "Cross-aggregate save") — writes HotsiteConfig's own layout[] entry (teaser fields) and
 * LeadFormConfig (audienceMode/questions) atomically. A deliberate, scoped exception to "one
 * aggregate per transaction": both aggregates live in the same bounded context (Platform) and
 * one manager action ("Aplicar") needs them to save together.
 */
@Injectable()
export class UpdateLeadFormModuleUseCase {
  constructor(
    @Inject(HOTSITE_CONFIG_REPOSITORY)
    private readonly hotsiteConfigRepo: IHotsiteConfigRepository,
    @Inject(LEAD_FORM_CONFIG_REPOSITORY)
    private readonly leadFormConfigRepo: ILeadFormConfigRepository,
    @Inject(TENANT_REPOSITORY) private readonly tenantRepo: ITenantRepository,
    @Inject(TRANSACTION_MANAGER) private readonly txManager: ITransactionManager,
  ) {}

  async execute(
    input: UpdateLeadFormModuleUseCaseInput,
  ): Promise<UpdateLeadFormModuleUseCaseResult> {
    const { tenantId, audienceMode, questions, ...teaserPatch } = input;

    const hotsiteConfig = await this.hotsiteConfigRepo.findByTenantId(tenantId);
    if (!hotsiteConfig) throw new HotsiteNotFoundError(tenantId);

    const leadFormConfig =
      (await this.leadFormConfigRepo.findByTenantId(tenantId)) ?? LeadFormConfig.create(tenantId);

    // Domain mutations happen before txManager.run() opens (docs/ENGINEERING_RULES.md §
    // Transactions "Scope rule") — a validation failure here (e.g. >20 questions) never opens a
    // transaction at all, so neither aggregate's save() is ever reached.
    if (audienceMode !== undefined) leadFormConfig.updateAudienceMode(audienceMode);
    if (questions !== undefined) leadFormConfig.updateQuestions(questions);

    const existingModule = hotsiteConfig.layout.find((module) => module.type === 'LEAD_FORM');
    const existingData =
      (existingModule?.data as LeadFormModuleData | undefined) ?? DEFAULT_LEAD_FORM_MODULE_DATA;
    const mergedData = this.mergeTeaser(existingData, teaserPatch);

    const newModule: HotsiteModule = {
      type: 'LEAD_FORM',
      // enabled is owned entirely by the Layout tab's own toggle (PATCH /v1/tenants/hotsite),
      // never this endpoint — preserve the current value, default false for a brand-new entry.
      enabled: existingModule?.enabled ?? false,
      data: mergedData,
    };
    const newLayout = existingModule
      ? hotsiteConfig.layout.map((module) => (module.type === 'LEAD_FORM' ? newModule : module))
      : [...hotsiteConfig.layout, newModule];

    await this.txManager.run(async () => {
      // Locked and re-read here, not before the transaction — carouselDays vs.
      // maxBookingAdvanceDays is a cross-aggregate invariant validated by
      // HotsiteConfig.updateContent() against every module already present in the layout, not
      // just LEAD_FORM (mirrors UpdateHotsiteContentUseCase's identical technique).
      const tenant = await this.tenantRepo.findByIdForUpdate(tenantId);
      if (!tenant) throw new TenantNotFoundError(tenantId);

      hotsiteConfig.updateContent(hotsiteConfig.branding, newLayout, hotsiteConfig.seo, {
        maxBookingAdvanceDays: tenant.settings.booking.maxBookingAdvanceDays,
      });

      await this.hotsiteConfigRepo.save(hotsiteConfig);
      await this.leadFormConfigRepo.save(leadFormConfig);
    });

    return {
      ...mergedData,
      audienceMode: leadFormConfig.audienceMode,
      questions: leadFormConfig.questions,
    };
  }

  private mergeTeaser(existing: LeadFormModuleData, patch: TeaserPatch): LeadFormModuleData {
    const merged: LeadFormModuleData = { ...existing };
    if (patch.title !== undefined) merged.title = patch.title;
    if (patch.subtitle !== undefined) merged.subtitle = patch.subtitle;
    if (patch.eyebrow !== undefined) merged.eyebrow = patch.eyebrow;
    if (patch.ctaLabel !== undefined) merged.ctaLabel = patch.ctaLabel;
    if (patch.variant !== undefined) merged.variant = patch.variant;
    if (patch.backgroundImageUrl !== undefined)
      merged.backgroundImageUrl = patch.backgroundImageUrl;
    if (patch.backgroundImagePosition !== undefined) {
      merged.backgroundImagePosition = patch.backgroundImagePosition;
    }
    if (patch.bgStyle !== undefined) merged.bgStyle = patch.bgStyle;
    return merged;
  }
}
