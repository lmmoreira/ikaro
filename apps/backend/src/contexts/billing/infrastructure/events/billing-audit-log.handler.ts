import { Injectable } from '@nestjs/common';
import { LogDomainEventUseCase } from '../../../../shared/application/use-cases/log-domain-event.use-case';
import { AuditLogHandlerBase } from '../../../../shared/infrastructure/audit-log/audit-log-handler.base';
import { ChargeIssued } from '../../domain/events/charge-issued.event';
import { ChargePaid } from '../../domain/events/charge-paid.event';
import { SubscriptionPastDue } from '../../domain/events/subscription-past-due.event';
import { SubscriptionCancelled } from '../../domain/events/subscription-cancelled.event';
import { PlanChanged } from '../../domain/events/plan-changed.event';
import { SubscriptionPriceChangeAnnounced } from '../../domain/events/subscription-price-change-announced.event';
import { SubscriptionReactivated } from '../../domain/events/subscription-reactivated.event';
import { SubscriptionSuspended } from '../../domain/events/subscription-suspended.event';

// The billing context's `audit-log` consumer (M25-S15b): subscribes to every domain event this
// context owns and hands each one to the shared LogDomainEventUseCase. A new billing event must be
// added here — `architecture-check`'s domain-event-audit-coverage detector fails CI otherwise, and
// this call site is what gives the event a Pub/Sub topic.
@Injectable()
export class BillingAuditLogHandler extends AuditLogHandlerBase {
  onModuleInit(): void {
    this.subscribeSubscriptionEvents();
    this.subscribeChargeEvents();
  }

  private subscribeSubscriptionEvents(): void {
    this.eventBus.subscribe(
      SubscriptionSuspended.name,
      (event) => this.handle(event),
      LogDomainEventUseCase.CONSUMER_NAME,
      { skipWhenSuspended: false },
    );
    this.eventBus.subscribe(
      SubscriptionReactivated.name,
      (event) => this.handle(event),
      LogDomainEventUseCase.CONSUMER_NAME,
      { skipWhenSuspended: false },
    );
    this.eventBus.subscribe(
      SubscriptionPastDue.name,
      (event) => this.handle(event),
      LogDomainEventUseCase.CONSUMER_NAME,
      { skipWhenSuspended: false },
    );
    this.eventBus.subscribe(
      SubscriptionCancelled.name,
      (event) => this.handle(event),
      LogDomainEventUseCase.CONSUMER_NAME,
      { skipWhenSuspended: false },
    );
    this.eventBus.subscribe(
      PlanChanged.name,
      (event) => this.handle(event),
      LogDomainEventUseCase.CONSUMER_NAME,
      { skipWhenSuspended: false },
    );
    this.eventBus.subscribe(
      SubscriptionPriceChangeAnnounced.name,
      (event) => this.handle(event),
      LogDomainEventUseCase.CONSUMER_NAME,
      { skipWhenSuspended: false },
    );
  }

  private subscribeChargeEvents(): void {
    this.eventBus.subscribe(
      ChargeIssued.name,
      (event) => this.handle(event),
      LogDomainEventUseCase.CONSUMER_NAME,
      { skipWhenSuspended: false },
    );
    this.eventBus.subscribe(
      ChargePaid.name,
      (event) => this.handle(event),
      LogDomainEventUseCase.CONSUMER_NAME,
      { skipWhenSuspended: false },
    );
  }
}
