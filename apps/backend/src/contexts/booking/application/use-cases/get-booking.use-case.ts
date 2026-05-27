import { Inject, Injectable } from '@nestjs/common';
import { TenantContext } from '../../../../shared/tenant/tenant-context';
import { BOOKING_REPOSITORY, IBookingRepository } from '../ports/booking-repository.port';
import { BookingNotFoundError } from '../../domain/errors/booking-domain.error';
import { Booking } from '../../domain/booking.aggregate';

export interface BookingLineDetail {
  lineId: string;
  serviceId: string;
  serviceNameAtBooking: string;
  priceAtBooking: { amount: number; currency: string; formatted: string };
  durationMinsAtBooking: number;
  pointsValueAtBooking: number;
  requiresPickupAddressAtBooking: boolean;
  actualPriceCharged: { amount: number; currency: string; formatted: string } | null;
}

export interface GetBookingUseCaseResult {
  id: string;
  status: string;
  type: string;
  customerId: string | null;
  guestName: string;
  guestEmail: string;
  guestPhone: string;
  scheduledAt: string;
  totalDurationMins: number;
  totalPrice: { amount: number; currency: string; formatted: string };
  totalActualPrice: { amount: number; currency: string; formatted: string } | null;
  pickupAddress: {
    street: string;
    number: string;
    complement: string | null;
    neighborhood: string;
    city: string;
    state: string;
    zipCode: string;
  } | null;
  lines: BookingLineDetail[];
  beforeServicePhotoUrls: string[];
  afterServicePhotoUrls: string[];
  adminNotes: string | null;
  infoRequestMessage: string | null;
  infoResponseMessage: string | null;
  createdAt: string;
}

@Injectable()
export class GetBookingUseCase {
  constructor(
    @Inject(BOOKING_REPOSITORY) private readonly bookingRepo: IBookingRepository,
    private readonly tenantContext: TenantContext,
  ) {}

  async execute(dto: { bookingId: string }): Promise<GetBookingUseCaseResult> {
    const { tenantId, actorId, actorRole } = this.tenantContext;

    const booking = await this.bookingRepo.findById(dto.bookingId, tenantId);
    if (!booking) throw new BookingNotFoundError(dto.bookingId);

    const isStaffOrManager = actorRole === 'MANAGER' || actorRole === 'STAFF';
    if (!isStaffOrManager && booking.customerId !== actorId) {
      throw new BookingNotFoundError(dto.bookingId);
    }

    return this.toResult(booking);
  }

  private toResult(booking: Booking): GetBookingUseCaseResult {
    const addr = booking.pickupAddress?.toJSON() ?? null;
    return {
      id: booking.id,
      status: booking.status,
      type: booking.type,
      customerId: booking.customerId,
      guestName: booking.guestName,
      guestEmail: booking.guestEmail.address,
      guestPhone: booking.guestPhone.value,
      scheduledAt: booking.scheduledAt.toISOString(),
      totalDurationMins: booking.totalDurationMins,
      totalPrice: {
        amount: booking.totalPrice.amount.toNumber(),
        currency: booking.totalPrice.currency,
        formatted: booking.totalPrice.format(),
      },
      totalActualPrice: booking.totalActualPrice
        ? {
            amount: booking.totalActualPrice.amount.toNumber(),
            currency: booking.totalActualPrice.currency,
            formatted: booking.totalActualPrice.format(),
          }
        : null,
      pickupAddress: addr
        ? {
            street: addr.street,
            number: addr.number,
            complement: addr.complement ?? null,
            neighborhood: addr.neighborhood,
            city: addr.city,
            state: addr.state,
            zipCode: addr.zipCode,
          }
        : null,
      lines: booking.lines.map((l) => ({
        lineId: l.lineId,
        serviceId: l.serviceId,
        serviceNameAtBooking: l.serviceNameAtBooking,
        priceAtBooking: {
          amount: l.priceAtBooking.amount.toNumber(),
          currency: l.priceAtBooking.currency,
          formatted: l.priceAtBooking.format(),
        },
        durationMinsAtBooking: l.durationMinsAtBooking,
        pointsValueAtBooking: l.pointsValueAtBooking,
        requiresPickupAddressAtBooking: l.requiresPickupAddressAtBooking,
        actualPriceCharged: l.actualPriceCharged
          ? {
              amount: l.actualPriceCharged.amount.toNumber(),
              currency: l.actualPriceCharged.currency,
              formatted: l.actualPriceCharged.format(),
            }
          : null,
      })),
      beforeServicePhotoUrls: booking.beforeServicePhotoUrls,
      afterServicePhotoUrls: booking.afterServicePhotoUrls,
      adminNotes: booking.adminNotes,
      infoRequestMessage: booking.infoRequestMessage,
      infoResponseMessage: booking.infoResponseMessage,
      createdAt: booking.createdAt.toISOString(),
    };
  }
}
