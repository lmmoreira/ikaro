import {
  SendPriceChangeAnnouncedNotificationDto,
  PriceChangeLine,
} from '../../../contexts/notification/application/dtos/send-price-change-announced-notification.dto';
import { addDaysUTC, todayUTC } from '../../../shared/utils/calendar-date';

export class SendPriceChangeAnnouncedNotificationDtoBuilder {
  private tenantId = 'aaaaaaaa-0000-4000-8000-000000002601';
  private eventId = 'eeeeeeee-0000-4000-8000-000000002601';
  private correlationId = 'corr-0000-4000-8000-000000002601';
  private changes: PriceChangeLine[] = [
    { featureKey: 'BOOKING', tier: 'STANDARD', oldAmountMinor: 3900, newAmountMinor: 4900 },
  ];
  private currency: string = 'BRL';
  private effectiveFrom: string = addDaysUTC(todayUTC(), 14);
  private newMonthlyTotalMinor: number = 9990;
  private recipientEmail: string | null = 'billing@example.test';

  withTenantId(tenantId: string): this {
    this.tenantId = tenantId;
    return this;
  }

  withEventId(eventId: string): this {
    this.eventId = eventId;
    return this;
  }

  withCorrelationId(correlationId: string): this {
    this.correlationId = correlationId;
    return this;
  }

  withChanges(changes: PriceChangeLine[]): this {
    this.changes = changes;
    return this;
  }

  withCurrency(currency: string): this {
    this.currency = currency;
    return this;
  }

  withEffectiveFrom(effectiveFrom: string): this {
    this.effectiveFrom = effectiveFrom;
    return this;
  }

  withNewMonthlyTotalMinor(newMonthlyTotalMinor: number): this {
    this.newMonthlyTotalMinor = newMonthlyTotalMinor;
    return this;
  }

  withRecipientEmail(recipientEmail: string | null): this {
    this.recipientEmail = recipientEmail;
    return this;
  }

  build(): SendPriceChangeAnnouncedNotificationDto {
    return {
      tenantId: this.tenantId,
      eventId: this.eventId,
      correlationId: this.correlationId,
      changes: this.changes,
      currency: this.currency,
      effectiveFrom: this.effectiveFrom,
      newMonthlyTotalMinor: this.newMonthlyTotalMinor,
      recipientEmail: this.recipientEmail,
    };
  }
}
