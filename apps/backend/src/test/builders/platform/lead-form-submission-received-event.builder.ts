import { LeadFormSubmissionReceived } from '../../../contexts/platform/domain/events/lead-form-submission-received.event';
import { uuidv7 } from '../../../shared/domain/uuid-v7';

export class LeadFormSubmissionReceivedEventBuilder {
  private tenantId = 'aaaaaaaa-0000-4000-8000-000000000001';
  private correlationId = '00000000-0000-4000-8000-000000000001';
  private submissionId = uuidv7();
  private customerId: string | null = null;

  withTenantId(tenantId: string): this {
    this.tenantId = tenantId;
    return this;
  }

  withCorrelationId(correlationId: string): this {
    this.correlationId = correlationId;
    return this;
  }

  withSubmissionId(submissionId: string): this {
    this.submissionId = submissionId;
    return this;
  }

  withCustomerId(customerId: string | null): this {
    this.customerId = customerId;
    return this;
  }

  build(): LeadFormSubmissionReceived {
    return new LeadFormSubmissionReceived(this.tenantId, this.correlationId, {
      submissionId: this.submissionId,
      customerId: this.customerId,
    });
  }
}
