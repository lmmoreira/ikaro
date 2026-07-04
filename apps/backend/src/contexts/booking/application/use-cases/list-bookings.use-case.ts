import { Inject, Injectable } from '@nestjs/common';
import { BOOKING_REPOSITORY, IBookingRepository } from '../ports/booking-repository.port';
import { ListBookingsDto } from '../dtos/list-bookings.dto';
import { Booking, BookingStatus } from '../../domain/booking.aggregate';

export type ListBookingsInput = ListBookingsDto & {
  tenantId: string;
  locale: string;
  customerId?: string;
  cancellationWindowHours: number;
};

export interface BookingLineSummary {
  lineId: string;
  serviceId: string;
  serviceNameAtBooking: string;
  durationMinsAtBooking: number;
  priceAtBooking: { amount: number; currency: string; formatted: string };
}

export interface BookingListItem {
  id: string;
  status: string;
  type: string;
  customerId: string | null;
  contactName: string;
  contactEmail: string;
  scheduledAt: string;
  totalDurationMins: number;
  totalPrice: { amount: number; currency: string; formatted: string };
  lineSummary: BookingLineSummary[];
  createdAt: string;
  // Deadline for customer self-cancellation (UC-007) — scheduledAt minus the tenant's
  // cancellation window. Only APPROVED bookings carry it; other statuses are null.
  cancellableUntil: string | null;
}

export interface ListBookingsUseCaseResult {
  items: BookingListItem[];
  pagination: { limit: number; offset: number; total: number; hasMore: boolean };
}

@Injectable()
export class ListBookingsUseCase {
  constructor(@Inject(BOOKING_REPOSITORY) private readonly bookingRepo: IBookingRepository) {}

  async execute(input: ListBookingsInput): Promise<ListBookingsUseCaseResult> {
    const { tenantId, locale, customerId, cancellationWindowHours } = input;

    const { items, total } = await this.bookingRepo.findAllByTenantPaginated(tenantId, {
      status: input.status,
      customerId,
      scheduledAfter: input.from ? new Date(input.from) : undefined,
      scheduledBefore: input.to ? new Date(input.to) : undefined,
      limit: input.limit,
      offset: input.offset,
    });

    return {
      items: items.map((b) => this.toListItem(b, locale, cancellationWindowHours)),
      pagination: {
        limit: input.limit,
        offset: input.offset,
        total,
        hasMore: input.offset + input.limit < total,
      },
    };
  }

  private toListItem(
    booking: Booking,
    locale: string,
    cancellationWindowHours: number,
  ): BookingListItem {
    return {
      id: booking.id,
      status: booking.status,
      type: booking.type,
      customerId: booking.customerId,
      contactName: booking.contactName,
      contactEmail: booking.contactEmail.address,
      scheduledAt: booking.scheduledAt.toISOString(),
      totalDurationMins: booking.totalDurationMins,
      totalPrice: {
        amount: booking.totalPrice.amount.toNumber(),
        currency: booking.totalPrice.currency,
        formatted: booking.totalPrice.format(locale),
      },
      lineSummary: booking.lines.map((l) => ({
        lineId: l.lineId,
        serviceId: l.serviceId,
        serviceNameAtBooking: l.serviceNameAtBooking,
        durationMinsAtBooking: l.durationMinsAtBooking,
        priceAtBooking: {
          amount: l.priceAtBooking.amount.toNumber(),
          currency: l.priceAtBooking.currency,
          formatted: l.priceAtBooking.format(locale),
        },
      })),
      createdAt: booking.createdAt.toISOString(),
      cancellableUntil:
        booking.status === BookingStatus.APPROVED
          ? booking.cancellableUntil(cancellationWindowHours).toISOString()
          : null,
    };
  }
}
