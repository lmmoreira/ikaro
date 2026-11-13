import { Injectable } from '@nestjs/common';
import { LogDomainEventUseCase } from '../../../../shared/application/use-cases/log-domain-event.use-case';
import { AuditLogHandlerBase } from '../../../../shared/infrastructure/audit-log/audit-log-handler.base';
import { SubscriptionReactivated } from '../../domain/events/subscription-reactivated.event';
import { SubscriptionSuspended } from '../../domain/events/subscription-suspended.event';

// The billing context's `audit-log` consumer (M25-S15b): subscribes to every domain event this
// context owns and hands each one to the shared LogDomainEventUseCase. A new billing event must be
// added here — `architecture-check`'s domain-event-audit-coverage detector fails CI otherwise, and
// this call site is what gives the event a Pub/Sub topic.
@Injectable()
export class BillingAuditLogHandler extends AuditLogHandlerBase {
  onModuleInit(): void {
    this.eventBus.subscribe(
      SubscriptionSuspended.name,
      (event) => this.handle(event),
      LogDomainEventUseCase.CONSUMER_NAME,
    );
    this.eventBus.subscribe(
      SubscriptionReactivated.name,
      (event) => this.handle(event),
      LogDomainEventUseCase.CONSUMER_NAME,
    );
  }
}
