import { DomainEvent } from '../../../../shared/domain/domain-event';

interface BookingInfoRequestedData extends Record<string, unknown> {
  bookingId: string;
  customerId: string | null;
  contactEmail: string;
  contactName: string;
  informationNeeded: string;
  requestedBy: string;
}

export class BookingInfoRequested extends DomainEvent<BookingInfoRequestedData> {
  readonly eventVersion = 1;
  readonly data: BookingInfoRequestedData;

  constructor(tenantId: string, correlationId: string, data: BookingInfoRequestedData) {
    super(tenantId, correlationId);
    this.data = data;
  }
}
