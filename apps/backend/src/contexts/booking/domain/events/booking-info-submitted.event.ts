import { DomainEvent } from '../../../../shared/domain/domain-event';

interface BookingInfoSubmittedData extends Record<string, unknown> {
  bookingId: string;
  customerId: string | null;
  submittedByEmail: string;
  infoPayload: Record<string, unknown>;
  photoUrls: string[];
}

export class BookingInfoSubmitted extends DomainEvent<BookingInfoSubmittedData> {
  readonly eventVersion = 1;
  readonly data: BookingInfoSubmittedData;

  constructor(tenantId: string, correlationId: string, data: BookingInfoSubmittedData) {
    super(tenantId, correlationId);
    this.data = data;
  }
}
