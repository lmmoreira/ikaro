import { Injectable } from '@nestjs/common';
import { LogDomainEventUseCase } from '../../../../shared/application/use-cases/log-domain-event.use-case';
import { AuditLogHandlerBase } from '../../../../shared/infrastructure/audit-log/audit-log-handler.base';
import { LeadFormSubmissionReceived } from '../../domain/events/lead-form-submission-received.event';
import { TenantProvisioned } from '../../domain/events/tenant-provisioned.event';

// The platform context's `audit-log` consumer (M23-S36): subscribes to every domain event this
// context owns and hands each one to the shared LogDomainEventUseCase. A new platform event must be
// added here — `architecture-check`'s domain-event-audit-coverage detector fails CI otherwise.
@Injectable()
export class PlatformAuditLogHandler extends AuditLogHandlerBase {
  onModuleInit(): void {
    this.eventBus.subscribe(
      LeadFormSubmissionReceived.name,
      (event) => this.handle(event),
      LogDomainEventUseCase.CONSUMER_NAME,
    );
    this.eventBus.subscribe(
      TenantProvisioned.name,
      (event) => this.handle(event),
      LogDomainEventUseCase.CONSUMER_NAME,
    );
  }
}
