import { Inject, Injectable } from '@nestjs/common';
import { deepMerge } from '../../../../shared/utils/deep-merge';
import {
  ITransactionManager,
  TRANSACTION_MANAGER,
} from '../../../../shared/ports/transaction-manager.port';
import { IStorageService, STORAGE_SERVICE } from '../../../../shared/ports/storage.service.port';
import {
  DEFAULT_LEAD_FORM_MODULE_DATA,
  HotsiteBranding,
  HotsiteConfig,
  HotsiteModule,
  HotsiteSeo,
  LeadFormModuleData,
} from '../../domain/hotsite-config.aggregate';
import {
  HotsiteNotFoundError,
  TenantNotFoundError,
} from '../../domain/errors/platform-domain.error';
import {
  LeadFormAudienceMode,
  LeadFormConfig,
  LeadFormQuestion,
} from '../../domain/lead-form-config.aggregate';
import { HotsiteImagePathsService } from '../../domain/services/hotsite-image-paths.service';
import { HotsiteImageUrlResolver } from '../../domain/services/hotsite-image-url-resolver.service';
import {
  HotsiteImagePromotionService,
  ImagePromotionOperation,
} from '../services/hotsite-image-promotion.service';
import {
  HOTSITE_CONFIG_REPOSITORY,
  IHotsiteConfigRepository,
} from '../ports/hotsite-config-repository.port';
import {
  ILeadFormConfigRepository,
  LEAD_FORM_CONFIG_REPOSITORY,
} from '../ports/lead-form-config-repository.port';
import {
  ILeadFormSubmissionRepository,
  LEAD_FORM_SUBMISSION_REPOSITORY,
} from '../ports/lead-form-submission-repository.port';
import { ITenantRepository, TENANT_REPOSITORY } from '../ports/tenant-repository.port';
import { GetLeadFormConfigUseCaseResult } from './get-lead-form-config.use-case';

export interface UpdateLeadFormModuleUseCaseInput {
  tenantId: string;
  branding?: Partial<HotsiteBranding>;
  layout?: HotsiteModule[];
  seo?: Partial<HotsiteSeo>;
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
  'tenantId' | 'branding' | 'layout' | 'seo' | 'audienceMode' | 'questions'
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
    @Inject(LEAD_FORM_SUBMISSION_REPOSITORY)
    private readonly leadFormSubmissionRepo: ILeadFormSubmissionRepository,
    @Inject(TENANT_REPOSITORY) private readonly tenantRepo: ITenantRepository,
    @Inject(TRANSACTION_MANAGER) private readonly txManager: ITransactionManager,
    private readonly imagePathsService: HotsiteImagePathsService,
    private readonly imagePromotionService: HotsiteImagePromotionService,
    private readonly imageUrlResolver: HotsiteImageUrlResolver,
    @Inject(STORAGE_SERVICE) private readonly storageService: IStorageService,
  ) {}

  async execute(
    input: UpdateLeadFormModuleUseCaseInput,
  ): Promise<UpdateLeadFormModuleUseCaseResult> {
    const { tenantId, branding, layout, seo, audienceMode, questions, ...teaserPatch } = input;
    const hotsiteConfig = await this.hotsiteConfigRepo.findByTenantId(tenantId);
    if (!hotsiteConfig) throw new HotsiteNotFoundError(tenantId);
    const leadFormConfig =
      (await this.leadFormConfigRepo.findByTenantId(tenantId)) ?? LeadFormConfig.create(tenantId);

    if (audienceMode !== undefined) leadFormConfig.updateAudienceMode(audienceMode);
    if (questions !== undefined) leadFormConfig.updateQuestions(questions);

    const mergedLayout = this.mergeLayout(layout ?? hotsiteConfig.layout, teaserPatch);
    const mergedBranding = branding
      ? { ...hotsiteConfig.branding, ...branding }
      : hotsiteConfig.branding;
    const mergedSeo = seo ? { ...hotsiteConfig.seo, ...seo } : hotsiteConfig.seo;
    const {
      branding: promotedBranding,
      layout: promotedLayout,
      seo: promotedSeo,
      promotions,
      deletions,
    } = await this.planImagePromotion(
      hotsiteConfig,
      mergedBranding,
      mergedLayout,
      mergedSeo,
      tenantId,
    );

    await this.persist(
      tenantId,
      hotsiteConfig,
      leadFormConfig,
      promotedBranding,
      promotedLayout,
      promotedSeo,
      promotions,
      deletions,
    );

    return this.buildResult(hotsiteConfig, leadFormConfig);
  }

  /**
   * Captures the pre-merge image paths, then delegates to HotsiteImagePromotionService — same
   * "delete-previous-on-replace" technique UpdateHotsiteContentUseCase uses; this module's own
   * backgroundImageUrl field is subject to the identical tmp/-upload-promotion + orphan-cleanup
   * lifecycle as every other module's.
   */
  private async planImagePromotion(
    hotsiteConfig: HotsiteConfig,
    sourceBranding: HotsiteBranding,
    mergedLayout: HotsiteModule[],
    sourceSeo: HotsiteSeo,
    tenantId: string,
  ): Promise<{
    branding: HotsiteBranding;
    layout: HotsiteModule[];
    seo: HotsiteSeo;
    promotions: ImagePromotionOperation[];
    deletions: string[];
  }> {
    const oldPaths = this.imagePathsService.collect(
      hotsiteConfig.branding,
      hotsiteConfig.layout,
      hotsiteConfig.seo,
    );
    const { branding, layout, seo, promotions } =
      await this.imagePromotionService.prepareImagePromotion(
        sourceBranding,
        mergedLayout,
        sourceSeo,
        tenantId,
      );
    const deletions = this.imagePromotionService.computeDeletions(
      oldPaths,
      branding,
      layout,
      seo,
      tenantId,
    );
    return { branding, layout, seo, promotions, deletions };
  }

  private async persist(
    tenantId: string,
    hotsiteConfig: HotsiteConfig,
    leadFormConfig: LeadFormConfig,
    branding: HotsiteBranding,
    layout: HotsiteModule[],
    seo: HotsiteSeo,
    promotions: ImagePromotionOperation[],
    deletions: string[],
  ): Promise<void> {
    await this.txManager.run(async () => {
      const tenant = await this.tenantRepo.findByIdForUpdate(tenantId);
      if (!tenant) throw new TenantNotFoundError(tenantId);
      hotsiteConfig.updateContent(branding, layout, seo, {
        maxBookingAdvanceDays: tenant.settings.booking.maxBookingAdvanceDays,
      });
      await this.hotsiteConfigRepo.save(hotsiteConfig);
      await this.leadFormConfigRepo.save(leadFormConfig);
      await this.txManager.scheduleAfterCommit(() =>
        this.imagePromotionService.executeImagePromotion(promotions, deletions),
      );
    });
  }

  /** Merges the incoming teaser patch onto the existing LEAD_FORM layout entry, preserving `enabled`. */
  private mergeLayout(existingLayout: HotsiteModule[], teaserPatch: TeaserPatch): HotsiteModule[] {
    const existingModule = existingLayout.find((module) => module.type === 'LEAD_FORM');
    const existingData =
      (existingModule?.data as LeadFormModuleData | undefined) ?? DEFAULT_LEAD_FORM_MODULE_DATA;
    const mergedData = deepMerge(existingData, teaserPatch as Partial<LeadFormModuleData>);

    const mergedModule: HotsiteModule = {
      type: 'LEAD_FORM',
      // enabled is owned entirely by the Layout tab's own toggle (PATCH /v1/tenants/hotsite),
      // never this endpoint — preserve the current value, default false for a brand-new entry.
      enabled: existingModule?.enabled ?? false,
      data: mergedData,
    };
    return existingModule
      ? existingLayout.map((module) => (module.type === 'LEAD_FORM' ? mergedModule : module))
      : [...existingLayout, mergedModule];
  }

  // Symmetric with GetLeadFormConfigUseCase/UpdateHotsiteContentUseCase: stored fields are raw
  // storage paths, not displayable URLs.
  private async buildResult(
    hotsiteConfig: HotsiteConfig,
    leadFormConfig: LeadFormConfig,
  ): Promise<UpdateLeadFormModuleUseCaseResult> {
    const resolved = this.imageUrlResolver.resolve(
      hotsiteConfig.branding,
      hotsiteConfig.layout,
      hotsiteConfig.seo,
      (storagePath) => this.storageService.getPublicUrl(storagePath),
    );
    const resolvedModule = resolved.layout.find((module) => module.type === 'LEAD_FORM');
    const resolvedData = resolvedModule?.data as LeadFormModuleData;

    const questionIdsWithSubmissions = new Set(
      await this.leadFormSubmissionRepo.findQuestionIdsWithSubmissions(
        leadFormConfig.tenantId,
        leadFormConfig.questions.map((question) => question.id),
      ),
    );

    return {
      ...resolvedData,
      audienceMode: leadFormConfig.audienceMode,
      questions: leadFormConfig.questions.map((question) => ({
        ...question,
        hasSubmissions: questionIdsWithSubmissions.has(question.id),
      })),
    };
  }
}
