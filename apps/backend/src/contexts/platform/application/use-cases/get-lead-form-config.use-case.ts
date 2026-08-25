import { Inject, Injectable } from '@nestjs/common';
import {
  DEFAULT_LEAD_FORM_MODULE_DATA,
  LeadFormModuleData,
} from '../../domain/hotsite-config.aggregate';
import { LeadFormAudienceMode, LeadFormQuestion } from '../../domain/lead-form-config.aggregate';
import { HotsiteContentReader } from '../services/hotsite-content-reader.service';
import {
  ILeadFormConfigRepository,
  LEAD_FORM_CONFIG_REPOSITORY,
} from '../ports/lead-form-config-repository.port';
import {
  ILeadFormSubmissionRepository,
  LEAD_FORM_SUBMISSION_REPOSITORY,
} from '../ports/lead-form-submission-repository.port';

export interface GetLeadFormConfigUseCaseInput {
  tenantId: string;
}

export interface GetLeadFormConfigUseCaseResult extends LeadFormModuleData {
  audienceMode: LeadFormAudienceMode;
  questions: Array<LeadFormQuestion & { hasSubmissions: boolean }>;
}

@Injectable()
export class GetLeadFormConfigUseCase {
  constructor(
    private readonly hotsiteContentReader: HotsiteContentReader,
    @Inject(LEAD_FORM_CONFIG_REPOSITORY)
    private readonly leadFormConfigRepo: ILeadFormConfigRepository,
    @Inject(LEAD_FORM_SUBMISSION_REPOSITORY)
    private readonly leadFormSubmissionRepo: ILeadFormSubmissionRepository,
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
    const questions = leadFormConfig?.questions ?? [];
    const questionIdsWithSubmissions = new Set(
      await this.leadFormSubmissionRepo.findQuestionIdsWithSubmissions(
        tenantId,
        questions.map((question) => question.id),
      ),
    );

    return {
      ...teaser,
      audienceMode: leadFormConfig?.audienceMode ?? 'GUEST_AND_CUSTOMER',
      questions: questions.map((question) => ({
        ...question,
        hasSubmissions: questionIdsWithSubmissions.has(question.id),
      })),
    };
  }
}
