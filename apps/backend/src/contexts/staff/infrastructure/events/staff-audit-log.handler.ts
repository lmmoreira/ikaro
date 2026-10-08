import { Injectable } from '@nestjs/common';
import { LogDomainEventUseCase } from '../../../../shared/application/use-cases/log-domain-event.use-case';
import { AuditLogHandlerBase } from '../../../../shared/infrastructure/audit-log/audit-log-handler.base';
import { StaffActivated } from '../../domain/events/staff-activated.event';
import { StaffDeactivated } from '../../domain/events/staff-deactivated.event';
import { StaffInvited } from '../../domain/events/staff-invited.event';

// The staff context's `audit-log` consumer (M23-S36): subscribes to every domain event this
// context owns and hands each one to the shared LogDomainEventUseCase. A new staff event must be
// added here — `architecture-check`'s domain-event-audit-coverage detector fails CI otherwise.
@Injectable()
export class StaffAuditLogHandler extends AuditLogHandlerBase {
  onModuleInit(): void {
    this.eventBus.subscribe(
      StaffActivated.name,
      (event) => this.handle(event),
      LogDomainEventUseCase.CONSUMER_NAME,
    );
    this.eventBus.subscribe(
      StaffDeactivated.name,
      (event) => this.handle(event),
      LogDomainEventUseCase.CONSUMER_NAME,
    );
    this.eventBus.subscribe(
      StaffInvited.name,
      (event) => this.handle(event),
      LogDomainEventUseCase.CONSUMER_NAME,
    );
  }
}
