import { Inject, Injectable } from '@nestjs/common';
import { RequestContext } from '../../../../shared/request/request-context';
import { BOOKING_REPOSITORY, IBookingRepository } from '../ports/booking-repository.port';
import { BookingNotFoundError } from '../../domain/errors/booking-domain.error';
import { Booking } from '../../domain/booking.aggregate';
import { IStorageService, STORAGE_SERVICE } from '../../../../shared/ports/storage.service.port';

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

export interface GetBookingUseCaseResult {
  id: string;
  status: string;
  type: string;
  customerId: string | null;
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  contactAddress: BookingAddressDetail | null;
  scheduledAt: string;
  totalDurationMins: number;
  totalPrice: { amount: number; currency: string; formatted: string };
  totalActualPrice: { amount: number; currency: string; formatted: string } | null;
  pickupAddress: BookingAddressDetail | null;
  lines: BookingLineDetail[];
  beforeServicePhotoUrls: string[];
  afterServicePhotoUrls: string[];
  adminNotes: string | null;
  infoRequestMessage: string | null;
  infoResponseMessage: string | null;
  approvedAt: string | null;
  approvedBy: string | null;
  rejectionReason: string | null;
  createdAt: string;
}

@Injectable()
export class GetBookingUseCase {
  constructor(
    @Inject(BOOKING_REPOSITORY) private readonly bookingRepo: IBookingRepository,
    private readonly tenantContext: RequestContext,
    @Inject(STORAGE_SERVICE) private readonly storageService: IStorageService,
  ) {}

  async execute(dto: { bookingId: string }): Promise<GetBookingUseCaseResult> {
    const { tenantId, actorId, actorRole } = this.tenantContext;

    const booking = await this.bookingRepo.findById(dto.bookingId, tenantId);
    if (!booking) throw new BookingNotFoundError(dto.bookingId);

    const isStaffOrManager = actorRole === 'MANAGER' || actorRole === 'STAFF';
    if (!isStaffOrManager && booking.customerId !== actorId) {
      throw new BookingNotFoundError(dto.bookingId);
    }

    const { language: locale } = this.tenantContext.settings.localization;
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

  private signPhotoUrls(paths: string[]): Promise<string[]> {
    return Promise.all(
      paths.map(async (path) => (await this.storageService.generateReadSignedUrl(path)).signedUrl),
    );
  }

  private async toResult(booking: Booking, locale: string): Promise<GetBookingUseCaseResult> {
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
      scheduledAt: booking.scheduledAt.toISOString(),
      totalDurationMins: booking.totalDurationMins,
      totalPrice: {
        amount: booking.totalPrice.amount.toNumber(),
        currency: booking.totalPrice.currency,
        formatted: booking.totalPrice.format(locale),
      },
      totalActualPrice: booking.totalActualPrice
        ? {
            amount: booking.totalActualPrice.amount.toNumber(),
            currency: booking.totalActualPrice.currency,
            formatted: booking.totalActualPrice.format(locale),
          }
        : null,
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
        actualPriceCharged: l.actualPriceCharged
          ? {
              amount: l.actualPriceCharged.amount.toNumber(),
              currency: l.actualPriceCharged.currency,
              formatted: l.actualPriceCharged.format(locale),
            }
          : null,
      })),
      beforeServicePhotoUrls,
      afterServicePhotoUrls,
      adminNotes: booking.adminNotes,
      infoRequestMessage: booking.infoRequestMessage,
      infoResponseMessage: booking.infoResponseMessage,
      approvedAt: booking.approvedAt?.toISOString() ?? null,
      approvedBy: booking.approvedBy,
      rejectionReason: booking.rejectionReason,
      createdAt: booking.createdAt.toISOString(),
    };
  }
}
