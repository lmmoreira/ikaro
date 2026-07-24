import { Inject, Injectable } from '@nestjs/common';
import { IStorageService, STORAGE_SERVICE } from '../../../../shared/ports/storage.service.port';
import { Money } from '../../../../shared/value-objects/money';
import { Booking, BookingStatus } from '../../domain/booking.aggregate';
import { BookingNotFoundError } from '../../domain/errors/booking-domain.error';
import { BOOKING_REPOSITORY, IBookingRepository } from '../ports/booking-repository.port';

type MoneyDetail = { amount: number; currency: string };

export type GetBookingByIdInput = {
  bookingId: string;
  tenantId: string;
  cancellationWindowHours: number;
  requestingCustomerId?: string;
};

export interface BookingLineDetail {
  lineId: string;
  serviceId: string;
  serviceNameAtBooking: string;
  priceAtBooking: { amount: number; currency: string };
  durationMinsAtBooking: number;
  pointsValueAtBooking: number;
  requiresPickupAddressAtBooking: boolean;
  actualPriceCharged: { amount: number; currency: string } | null;
}

export interface BookingAddressDetail {
  street: string;
  number: string;
  complement: string | null;
  neighborhood: string | null;
  city: string;
  state: string;
  zipCode: string;
}

export interface GetBookingByIdUseCaseResult {
  id: string;
  status: string;
  type: string;
  customerId: string | null;
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  contactAddress: BookingAddressDetail | null;
  notes: string | null;
  scheduledAt: string;
  totalDurationMins: number;
  totalPrice: { amount: number; currency: string };
  totalActualPrice: { amount: number; currency: string } | null;
  discountPointsUsed: number | null;
  discountAmount: { amount: number; currency: string } | null;
  pickupAddress: BookingAddressDetail | null;
  lines: BookingLineDetail[];
  beforeServicePhotoUrls: string[];
  afterServicePhotoUrls: string[];
  beforeServicePhotoPaths: string[];
  afterServicePhotoPaths: string[];
  adminNotes: string | null;
  infoRequestMessage: string | null;
  infoResponseMessage: string | null;
  approvedAt: string | null;
  approvedBy: string | null;
  completedAt: string | null;
  rejectionReason: string | null;
  createdAt: string;
  // Customer self-cancellation deadline (UC-007) — non-null only for APPROVED bookings.
  cancellableUntil: string | null;
  // Sum of lines' pointsValueAtBooking — non-null only once COMPLETED.
  pointsEarned: number | null;
}

@Injectable()
export class GetBookingByIdUseCase {
  constructor(
    @Inject(BOOKING_REPOSITORY) private readonly bookingRepo: IBookingRepository,
    @Inject(STORAGE_SERVICE) private readonly storageService: IStorageService,
  ) {}

  async execute(input: GetBookingByIdInput): Promise<GetBookingByIdUseCaseResult> {
    const { tenantId, cancellationWindowHours, requestingCustomerId } = input;

    const booking = await this.bookingRepo.findById(input.bookingId, tenantId);
    if (!booking) throw new BookingNotFoundError(input.bookingId);

    // 404, not 403: a customer probing IDs must not learn a booking exists but isn't theirs.
    if (requestingCustomerId && booking.customerId !== requestingCustomerId) {
      throw new BookingNotFoundError(input.bookingId);
    }

    return this.toResult(booking, cancellationWindowHours);
  }

  private toAddressDetail(address: Booking['contactAddress']): BookingAddressDetail | null {
    const addr = address?.toJSON() ?? null;
    if (!addr) return null;
    return {
      street: addr.street,
      number: addr.number,
      complement: addr.complement ?? null,
      neighborhood: addr.neighborhood ?? null,
      city: addr.city,
      state: addr.state,
      zipCode: addr.zipCode,
    };
  }

  private toMoneyDetail(money: Money | null): MoneyDetail | null {
    if (!money) return null;
    return {
      amount: money.amount.toNumber(),
      currency: money.currency,
    };
  }

  private signPhotoUrls(paths: string[]): Promise<string[]> {
    return Promise.all(
      paths.map(async (path) => (await this.storageService.generateReadSignedUrl(path)).signedUrl),
    );
  }

  private async toResult(
    booking: Booking,
    cancellationWindowHours: number,
  ): Promise<GetBookingByIdUseCaseResult> {
    const [beforeServicePhotoUrls, afterServicePhotoUrls] = await Promise.all([
      this.signPhotoUrls(booking.beforeServicePhotoUrls),
      this.signPhotoUrls(booking.afterServicePhotoUrls),
    ]);

    return {
      id: booking.id,
      status: booking.status,
      type: booking.type,
      customerId: booking.customerId,
      contactName: booking.contactName,
      contactEmail: booking.contactEmail.address,
      contactPhone: booking.contactPhone.value,
      contactAddress: this.toAddressDetail(booking.contactAddress),
      notes: booking.notes,
      scheduledAt: booking.scheduledAt.toISOString(),
      totalDurationMins: booking.totalDurationMins,
      totalPrice: {
        amount: booking.totalPrice.amount.toNumber(),
        currency: booking.totalPrice.currency,
      },
      totalActualPrice: this.toMoneyDetail(booking.totalActualPrice),
      discountPointsUsed: booking.discountPointsUsed,
      discountAmount: this.toMoneyDetail(booking.discountAmount),
      pickupAddress: this.toAddressDetail(booking.pickupAddress),
      lines: booking.lines.map((l) => ({
        lineId: l.lineId,
        serviceId: l.serviceId,
        serviceNameAtBooking: l.serviceNameAtBooking,
        priceAtBooking: {
          amount: l.priceAtBooking.amount.toNumber(),
          currency: l.priceAtBooking.currency,
        },
        durationMinsAtBooking: l.durationMinsAtBooking,
        pointsValueAtBooking: l.pointsValueAtBooking,
        requiresPickupAddressAtBooking: l.requiresPickupAddressAtBooking,
        actualPriceCharged: this.toMoneyDetail(l.actualPriceCharged),
      })),
      beforeServicePhotoUrls,
      afterServicePhotoUrls,
      beforeServicePhotoPaths: booking.beforeServicePhotoUrls,
      afterServicePhotoPaths: booking.afterServicePhotoUrls,
      adminNotes: booking.adminNotes,
      infoRequestMessage: booking.infoRequestMessage,
      infoResponseMessage: booking.infoResponseMessage,
      approvedAt: booking.approvedAt?.toISOString() ?? null,
      approvedBy: booking.approvedBy,
      completedAt: booking.completedAt?.toISOString() ?? null,
      rejectionReason: booking.rejectionReason,
      createdAt: booking.createdAt.toISOString(),
      cancellableUntil: booking.cancellableUntilIso(cancellationWindowHours),
      pointsEarned: booking.status === BookingStatus.COMPLETED ? booking.pointsEarned() : null,
    };
  }
}
