import { Command } from '../../../../shared/domain/command';

interface TenantUnavailableNoticeDueData extends Record<string, unknown> {
  customerId: string;
}

// A Command, not a fact: nothing changes in Booking, it is the instruction "tell this customer the
// tenant became unavailable", derived from one SubscriptionSuspended event. It carries the customer
// id only (no email, no name): the address is resolved by Notification at send time, so no personal
// data sits in the outbox, in Pub/Sub or in a dead-letter queue.
//
// dedupKey is keyed on the suspension event, so a redelivery of that event writes nothing a second
// time, while a later suspension of the same tenant (a new event) notifies again.
export class TenantUnavailableNoticeDue extends Command<TenantUnavailableNoticeDueData> {
  readonly eventVersion = 1;
  readonly data: TenantUnavailableNoticeDueData;

  constructor(
    tenantId: string,
    correlationId: string,
    data: TenantUnavailableNoticeDueData,
    suspensionEventId: string,
  ) {
    super(
      tenantId,
      correlationId,
      `TenantUnavailableNoticeDue:${tenantId}:${suspensionEventId}:${data.customerId}`,
    );
    this.data = data;
  }
}
