import { Inject, Injectable } from '@nestjs/common';
import { IOutboxPublisher, OUTBOX_PUBLISHER } from '../../../../shared/ports/outbox-publisher.port';
import {
  ITransactionManager,
  TRANSACTION_MANAGER,
} from '../../../../shared/ports/transaction-manager.port';
import { BOOKING_CUSTOMER_PORT, IBookingCustomerPort } from '../ports/booking-customer.port';
import { BOOKING_PLATFORM_PORT, IBookingPlatformPort } from '../ports/booking-platform.port';
import { BOOKING_REPOSITORY, IBookingRepository } from '../ports/booking-repository.port';
import { WindowedTenantJob } from './windowed-tenant.job';

// The dependencies the two "bookings of a tenant-local day" reminder jobs share (the customer
// reminders and the admin digest): the bookings of the day, the customer profile for the recipient,
// and the outbox plus transaction manager that publish the Command. A job extending this class has
// no constructor of its own, so Nest resolves these from this class's parameter metadata.
@Injectable()
export abstract class BookingDayReminderJobBase extends WindowedTenantJob {
  constructor(
    @Inject(BOOKING_PLATFORM_PORT) tenantPort: IBookingPlatformPort,
    @Inject(BOOKING_REPOSITORY) protected readonly bookingRepo: IBookingRepository,
    @Inject(BOOKING_CUSTOMER_PORT) protected readonly customerProfilePort: IBookingCustomerPort,
    @Inject(OUTBOX_PUBLISHER) protected readonly outboxPublisher: IOutboxPublisher,
    @Inject(TRANSACTION_MANAGER) protected readonly txManager: ITransactionManager,
  ) {
    super(tenantPort);
  }
}
