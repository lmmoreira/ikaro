import { DomainEvent } from '../../../../shared/domain/domain-event';

interface LeadFormSubmissionReceivedData extends Record<string, unknown> {
  submissionId: string;
  customerId: string | null;
}

// Deliberately thin (docs/03-DOMAIN_EVENTS.md § LeadFormSubmissionReceived) — the submitted
// content itself (name/email/answers) is never carried in the event payload, matching how other
// PII-bearing events in this codebase keep bulk content out of the envelope and readable only via
// the aggregate's own row. No consumers yet (MVP) — kept for the audit trail and an obvious
// fast-follow (a notification/webhook consumer to the manager).
export class LeadFormSubmissionReceived extends DomainEvent<LeadFormSubmissionReceivedData> {
  readonly eventVersion = 1;
  readonly data: LeadFormSubmissionReceivedData;

  constructor(tenantId: string, correlationId: string, data: LeadFormSubmissionReceivedData) {
    super(tenantId, correlationId);
    this.data = data;
  }
}
