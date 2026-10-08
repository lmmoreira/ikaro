import { Injectable } from '@nestjs/common';
import { LogDomainEventUseCase } from '../../../../shared/application/use-cases/log-domain-event.use-case';
import { AuditLogHandlerBase } from '../../../../shared/infrastructure/audit-log/audit-log-handler.base';
import { ServicePointsEarned } from '../../domain/events/service-points-earned.event';

// The loyalty context's `audit-log` consumer (M23-S36): subscribes to every domain event this
// context owns and hands each one to the shared LogDomainEventUseCase. A new loyalty event must be
// added here — `architecture-check`'s domain-event-audit-coverage detector fails CI otherwise.
@Injectable()
export class LoyaltyAuditLogHandler extends AuditLogHandlerBase {
  onModuleInit(): void {
    this.eventBus.subscribe(
      ServicePointsEarned.name,
      (event) => this.handle(event),
      LogDomainEventUseCase.CONSUMER_NAME,
    );
  }
}
