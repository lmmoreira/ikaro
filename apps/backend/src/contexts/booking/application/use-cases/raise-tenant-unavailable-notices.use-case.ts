import { Inject, Injectable } from '@nestjs/common';
import { AppLogger } from '../../../../shared/observability/app-logger';
import { IOutboxPublisher, OUTBOX_PUBLISHER } from '../../../../shared/ports/outbox-publisher.port';
import {
  ITransactionManager,
  TRANSACTION_MANAGER,
} from '../../../../shared/ports/transaction-manager.port';
import {
  OUTBOX_PUBLISH_CHUNK_SIZE,
  publishToOutboxInChunks,
} from '../../../../shared/utils/publish-to-outbox-in-chunks';
import { TenantUnavailableNoticeDue } from '../../domain/commands/tenant-unavailable-notice-due.command';
import { BOOKING_REPOSITORY, IBookingRepository } from '../ports/booking-repository.port';

export interface RaiseTenantUnavailableNoticesUseCaseInput {
  tenantId: string;
  eventId: string;
  correlationId: string;
  reason: string;
  suspendedAt: string;
}

export interface RaiseTenantUnavailableNoticesUseCaseResult {
  noticesPublished: number;
}

// An allow-list, not "everything except CANCELED": a CANCELED suspension is a permanent
// deactivation (UC-142), so telling customers the business is "temporarily" unavailable would be
// false, and a reason Billing adds later sends nothing until it is listed here.
const NOTIFYING_REASONS: ReadonlySet<string> = new Set([
  'OPERATOR',
  'NON_PAYMENT',
  'PAYMENT_REVERSED',
]);

// The Booking half of the reason-neutral customer notice (M25-S28, UC-121 O-B1): one command per
// logged-in customer with an approved booking still ahead, written to the outbox a page at a time.
// Notification turns each command into one email. Idempotent by the command's dedupKey (keyed on
// the suspension event), so a redelivery, or a first run that stopped between two pages, finishes
// the rest and writes nothing twice.
@Injectable()
export class RaiseTenantUnavailableNoticesUseCase {
  private readonly logger = new AppLogger(RaiseTenantUnavailableNoticesUseCase.name);

  constructor(
    @Inject(BOOKING_REPOSITORY) private readonly bookingRepo: IBookingRepository,
    @Inject(OUTBOX_PUBLISHER) private readonly outboxPublisher: IOutboxPublisher,
    @Inject(TRANSACTION_MANAGER) private readonly txManager: ITransactionManager,
  ) {}

  async execute(
    input: RaiseTenantUnavailableNoticesUseCaseInput,
  ): Promise<RaiseTenantUnavailableNoticesUseCaseResult> {
    const { tenantId, eventId, correlationId, reason } = input;
    if (!NOTIFYING_REASONS.has(reason)) {
      this.logger.log('Suspension reason does not notify customers', {
        tenantId,
        correlationId,
        eventId,
        reason,
      });
      return { noticesPublished: 0 };
    }

    const noticesPublished = await this.publishNotices(input);

    this.logger.log('Tenant unavailable notices written to the outbox', {
      tenantId,
      correlationId,
      eventId,
      reason,
      noticesPublished,
    });
    return { noticesPublished };
  }

  // One page of customer ids at a time: the read runs before the page's transaction opens, the page
  // is written as one chunk, and the next page starts after the last id of this one. A page needs
  // the previous page's last id, so the pages are inherently sequential.
  private async publishNotices(
    input: RaiseTenantUnavailableNoticesUseCaseInput,
    cursor: string | null = null,
    publishedSoFar = 0,
  ): Promise<number> {
    const { tenantId, eventId, correlationId } = input;
    const page = await this.bookingRepo.findCustomerIdsWithApprovedBookingsAfter(
      tenantId,
      new Date(input.suspendedAt),
      cursor,
      OUTBOX_PUBLISH_CHUNK_SIZE,
    );
    await publishToOutboxInChunks(
      { txManager: this.txManager, outboxPublisher: this.outboxPublisher },
      page.map(
        (customerId) =>
          new TenantUnavailableNoticeDue(tenantId, correlationId, { customerId }, eventId),
      ),
    );
    const published = publishedSoFar + page.length;
    const lastCustomerId = page.at(-1);
    return page.length === OUTBOX_PUBLISH_CHUNK_SIZE && lastCustomerId !== undefined
      ? this.publishNotices(input, lastCustomerId, published)
      : published;
  }
}
