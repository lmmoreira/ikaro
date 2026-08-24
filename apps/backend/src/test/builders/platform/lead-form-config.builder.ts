import {
  LeadFormAudienceMode,
  LeadFormConfig,
  LeadFormQuestion,
} from '../../../contexts/platform/domain/lead-form-config.aggregate';

const DEFAULT_TENANT_ID = '01234567-0000-7000-8000-000000000001';

/** Shared test fixture for a single LeadFormQuestion — avoids re-declaring this shape per spec file. */
export function makeLeadFormQuestion(overrides: Partial<LeadFormQuestion> = {}): LeadFormQuestion {
  return {
    id: '01234567-0000-7000-8000-000000000101',
    label: 'Qual serviço te interessa?',
    type: 'TEXT',
    required: false,
    order: 0,
    ...overrides,
  };
}

/** Shared test fixture for N questions — used by every spec asserting the 20-question bound. */
export function makeLeadFormQuestions(count: number): LeadFormQuestion[] {
  return Array.from({ length: count }, (_, i) =>
    makeLeadFormQuestion({
      id: `01234567-0000-7000-8000-0000000001${String(i).padStart(2, '0')}`,
      label: `Question ${i}`,
      order: i,
    }),
  );
}

export class LeadFormConfigBuilder {
  private tenantId = DEFAULT_TENANT_ID;
  private audienceMode: LeadFormAudienceMode = 'GUEST_AND_CUSTOMER';
  private questions: LeadFormQuestion[] = [];

  withTenantId(tenantId: string): this {
    this.tenantId = tenantId;
    return this;
  }

  withAudienceMode(audienceMode: LeadFormAudienceMode): this {
    this.audienceMode = audienceMode;
    return this;
  }

  withQuestions(questions: LeadFormQuestion[]): this {
    this.questions = questions;
    return this;
  }

  build(): LeadFormConfig {
    const config = LeadFormConfig.create(this.tenantId);
    if (this.audienceMode !== 'GUEST_AND_CUSTOMER') config.updateAudienceMode(this.audienceMode);
    if (this.questions.length > 0) config.updateQuestions(this.questions);
    return config;
  }
}
