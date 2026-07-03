import { Inject, Injectable } from '@nestjs/common';
import { IStorageService, STORAGE_SERVICE } from '../../../../shared/ports/storage.service.port';
import { Money } from '../../../../shared/value-objects/money';
import { Booking } from '../../domain/booking.aggregate';
import { BookingNotFoundError } from '../../domain/errors/booking-domain.error';
import { BOOKING_REPOSITORY, IBookingRepository } from '../ports/booking-repository.port';

type MoneyDetail = { amount: number; currency: string; formatted: string };

export type GetBookingByIdInput = {
  bookingId: string;
  tenantId: string;
  locale: string;
};

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
  totalPrice: { amount: number; currency: string; formatted: string };
  totalActualPrice: { amount: number; currency: string; formatted: string } | null;
  discountPointsUsed: number | null;
  discountAmount: { amount: number; currency: string; formatted: string } | null;
  pickupAddress: BookingAddressDetail | null;
  lines: BookingLineDetail[];
  beforeServicePhotoUrls: string[];
  afterServicePhotoUrls: string[];
  adminNotes: string | null;
  infoRequestMessage: string | null;
  infoResponseMessage: string | null;
  approvedAt: string | null;
  approvedBy: string | null;
  completedAt: string | null;
  rejectionReason: string | null;
  createdAt: string;
}

@Injectable()
export class GetBookingByIdUseCase {
  constructor(
    @Inject(BOOKING_REPOSITORY) private readonly bookingRepo: IBookingRepository,
    @Inject(STORAGE_SERVICE) private readonly storageService: IStorageService,
  ) {}

  async execute(input: GetBookingByIdInput): Promise<GetBookingByIdUseCaseResult> {
    const { tenantId, locale } = input;

    const booking = await this.bookingRepo.findById(input.bookingId, tenantId);
    if (!booking) throw new BookingNotFoundError(input.bookingId);

    return this.toResult(booking, locale);
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

  private toMoneyDetail(money: Money | null, locale: string): MoneyDetail | null {
    if (!money) return null;
    return { amount: money.amount.toNumber(), currency: money.currency, formatted: money.format(locale) };
  }

  private signPhotoUrls(paths: string[]): Promise<string[]> {
    return Promise.all(
      paths.map(async (path) => (await this.storageService.generateReadSignedUrl(path)).signedUrl),
    );
  }

  private async toResult(booking: Booking, locale: string): Promise<GetBookingByIdUseCaseResult> {
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
        formatted: booking.totalPrice.format(locale),
      },
      totalActualPrice: this.toMoneyDetail(booking.totalActualPrice, locale),
      discountPointsUsed: booking.discountPointsUsed,
      discountAmount: this.toMoneyDetail(booking.discountAmount, locale),
      pickupAddress: this.toAddressDetail(booking.pickupAddress),
      lines: booking.lines.map((l) => ({
        lineId: l.lineId,
        serviceId: l.serviceId,
        serviceNameAtBooking: l.serviceNameAtBooking,
        priceAtBooking: {
          amount: l.priceAtBooking.amount.toNumber(),
          currency: l.priceAtBooking.currency,
          formatted: l.priceAtBooking.format(locale),
        },
        durationMinsAtBooking: l.durationMinsAtBooking,
        pointsValueAtBooking: l.pointsValueAtBooking,
        requiresPickupAddressAtBooking: l.requiresPickupAddressAtBooking,
        actualPriceCharged: this.toMoneyDetail(l.actualPriceCharged, locale),
      })),
      beforeServicePhotoUrls,
      afterServicePhotoUrls,
      adminNotes: booking.adminNotes,
      infoRequestMessage: booking.infoRequestMessage,
      infoResponseMessage: booking.infoResponseMessage,
      approvedAt: booking.approvedAt?.toISOString() ?? null,
      approvedBy: booking.approvedBy,
      completedAt: booking.completedAt?.toISOString() ?? null,
      rejectionReason: booking.rejectionReason,
      createdAt: booking.createdAt.toISOString(),
    };
  }
}
