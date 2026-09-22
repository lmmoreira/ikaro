import {
  LeadFormAudienceMode,
  LeadFormQuestion,
} from '../../../contexts/platform/domain/lead-form-config.aggregate';
import { LeadFormConfigEntity } from '../../../contexts/platform/infrastructure/entities/lead-form-config.entity';

export class LeadFormConfigEntityBuilder {
  private tenantId = 'tenant-id-1';
  private audienceMode: LeadFormAudienceMode = 'GUEST_AND_CUSTOMER';
  private questions: LeadFormQuestion[] = [];
  private readonly updatedAt = new Date('2026-01-01T00:00:00Z');

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

  build(): LeadFormConfigEntity {
    const e = new LeadFormConfigEntity();
    e.tenantId = this.tenantId;
    e.audienceMode = this.audienceMode;
    e.questions = this.questions;
    e.updatedAt = this.updatedAt;
    return e;
  }
}
