import { Inject, Injectable } from '@nestjs/common';
import { IStorageService, STORAGE_SERVICE } from '../../../../shared/ports/storage.service.port';
import {
  ITransactionManager,
  TRANSACTION_MANAGER,
} from '../../../../shared/ports/transaction-manager.port';
import { Money } from '../../../../shared/value-objects/money';
import { Booking, BookingStatus } from '../../domain/booking.aggregate';
import { BookingNotFoundError } from '../../domain/errors/booking-domain.error';
import { BOOKING_REPOSITORY, IBookingRepository } from '../ports/booking-repository.port';
import {
  IResourceOccupancyRepository,
  RESOURCE_OCCUPANCY_REPOSITORY,
} from '../ports/resource-occupancy-repository.port';
import { IServiceRepository, SERVICE_REPOSITORY } from '../ports/service-repository.port';
import { TenantBookingWindow } from './booking-window.helpers';
import {
  BookingRescheduleOptionsDetail,
  buildRescheduleOptions,
} from './booking-reschedule-options.helpers';

type MoneyDetail = { amount: number; currency: string };

export type GetBookingByIdUseCaseInput = {
  bookingId: string;
  tenantId: string;
  cancellationWindowHours: number;
  requestingCustomerId?: string;
  tenantBookingWindow?: TenantBookingWindow;
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
  // UC-069 — the customer reschedule screen's input; non-null only for a customer reading their own
  // APPROVED booking.
  reschedule: BookingRescheduleOptionsDetail | null;
  // Sum of lines' pointsValueAtBooking — non-null only once COMPLETED.
  pointsEarned: number | null;
}

@Injectable()
export class GetBookingByIdUseCase {
  constructor(
    @Inject(BOOKING_REPOSITORY) private readonly bookingRepo: IBookingRepository,
    @Inject(STORAGE_SERVICE) private readonly storageService: IStorageService,
    @Inject(SERVICE_REPOSITORY) private readonly serviceRepo: IServiceRepository,
    @Inject(RESOURCE_OCCUPANCY_REPOSITORY)
    private readonly occupancyRepo: IResourceOccupancyRepository,
    @Inject(TRANSACTION_MANAGER) private readonly txManager: ITransactionManager,
  ) {}

  async execute(input: GetBookingByIdUseCaseInput): Promise<GetBookingByIdUseCaseResult> {
    const { tenantId, cancellationWindowHours, requestingCustomerId } = input;

    const booking = await this.bookingRepo.findById(input.bookingId, tenantId);
    if (!booking) throw new BookingNotFoundError(input.bookingId);

    // 404, not 403: a customer probing IDs must not learn a booking exists but isn't theirs.
    // Compare against undefined, not truthiness — an empty-string requestingCustomerId must
    // still be treated as a real (mismatched) requester, not as "no requester supplied".
    if (requestingCustomerId !== undefined && booking.customerId !== requestingCustomerId) {
      throw new BookingNotFoundError(input.bookingId);
    }

    const reschedule =
      requestingCustomerId !== undefined && input.tenantBookingWindow
        ? await this.resolveRescheduleOptions(booking, input, input.tenantBookingWindow)
        : null;

    return this.toResult(booking, cancellationWindowHours, reschedule);
  }

  private async resolveRescheduleOptions(
    booking: Booking,
    input: GetBookingByIdUseCaseInput,
    tenantBookingWindow: TenantBookingWindow,
  ): Promise<BookingRescheduleOptionsDetail | null> {
    if (booking.status !== BookingStatus.APPROVED) return null;

    const serviceIds = [...new Set(booking.lines.map((line) => line.serviceId))];
    const [services, occupancyRows] = await Promise.all([
      this.serviceRepo.findByIds(serviceIds, input.tenantId),
      this.txManager.run(() =>
        this.occupancyRepo.findOccupancyByBookingLines(
          input.tenantId,
          booking.lines.map((line) => line.lineId),
        ),
      ),
    ]);

    return buildRescheduleOptions({
      booking,
      serviceMap: new Map(services.map((service) => [service.id, service])),
      occupancyRows,
      tenantDefaultRescheduleWindowHours: input.cancellationWindowHours,
      tenantBookingWindow,
    });
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

  private toLineDetail(l: Booking['lines'][number]): BookingLineDetail {
    return {
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
    };
  }

  private async toResult(
    booking: Booking,
    cancellationWindowHours: number,
    reschedule: BookingRescheduleOptionsDetail | null,
  ): Promise<GetBookingByIdUseCaseResult> {
    const [beforeServicePhotoUrls, afterServicePhotoUrls] = await Promise.all([
      this.signPhotoUrls(booking.beforeServicePhotoUrls),
      this.signPhotoUrls(booking.afterServicePhotoUrls),
    ]);

    return this.buildResult(
      booking,
      cancellationWindowHours,
      { beforeServicePhotoUrls, afterServicePhotoUrls },
      reschedule,
    );
  }

  private buildResult(
    booking: Booking,
    cancellationWindowHours: number,
    signedPhotoUrls: { beforeServicePhotoUrls: string[]; afterServicePhotoUrls: string[] },
    reschedule: BookingRescheduleOptionsDetail | null,
  ): GetBookingByIdUseCaseResult {
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
      totalPrice: this.toMoneyDetail(booking.totalPrice)!,
      totalActualPrice: this.toMoneyDetail(booking.totalActualPrice),
      discountPointsUsed: booking.discountPointsUsed,
      discountAmount: this.toMoneyDetail(booking.discountAmount),
      pickupAddress: this.toAddressDetail(booking.pickupAddress),
      lines: booking.lines.map((l) => this.toLineDetail(l)),
      ...signedPhotoUrls,
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
      reschedule,
      pointsEarned: booking.status === BookingStatus.COMPLETED ? booking.pointsEarned() : null,
    };
  }
}
