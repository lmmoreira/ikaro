import { Inject, Injectable } from '@nestjs/common';
import { IStorageService, STORAGE_SERVICE } from '../../../../shared/ports/storage.service.port';
import {
  ITransactionManager,
  TRANSACTION_MANAGER,
} from '../../../../shared/ports/transaction-manager.port';
import { Booking, BookingStatus } from '../../domain/booking.aggregate';
import { BookingNotFoundError } from '../../domain/errors/booking-domain.error';
import { BOOKING_REPOSITORY, IBookingRepository } from '../ports/booking-repository.port';
import { BOOKING_STAFF_PORT, IBookingStaffPort } from '../ports/booking-staff.port';
import {
  FUTURE_COMMITMENT_EXCEPTION_REPOSITORY,
  IFutureCommitmentExceptionRepository,
} from '../ports/future-commitment-exception-repository.port';
import {
  BOOKING_STATUS_TRANSITION_REPOSITORY,
  IBookingStatusTransitionRepository,
} from '../ports/booking-status-transition-repository.port';
import {
  IResourceOccupancyRepository,
  RESOURCE_OCCUPANCY_REPOSITORY,
} from '../ports/resource-occupancy-repository.port';
import { IServiceRepository, SERVICE_REPOSITORY } from '../ports/service-repository.port';
import {
  BookingAddressDetail,
  BookingLineDetail,
  toAddressDetail,
  toLineDetail,
  toMoneyDetail,
} from './booking-detail.helpers';
import { TenantBookingWindow } from './booking-window.helpers';
import {
  BookingStatusHistoryEntryDetail,
  loadStatusHistory,
} from './booking-status-history.helpers';
import {
  BookingRescheduleOptionsDetail,
  buildRescheduleOptions,
} from './booking-reschedule-options.helpers';

export type { BookingAddressDetail, BookingLineDetail } from './booking-detail.helpers';

export type GetBookingByIdUseCaseInput = {
  bookingId: string;
  tenantId: string;
  cancellationWindowHours: number;
  requestingCustomerId?: string;
  tenantBookingWindow?: TenantBookingWindow;
  // Staff-facing reads only (M23-S27): loads the booking's status history. Off by default so the
  // customer read and the loyalty adapter's read never touch the transitions table.
  includeStatusHistory?: boolean;
  // Staff-facing reads only (M23-S46): looks up whether the booking has an open "Reservas a
  // resolver" entry. Off by default so the customer read and the loyalty adapter's read never
  // query the worklist.
  includeOpenException?: boolean;
};

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
  // Oldest first; null unless the caller asked for it (includeStatusHistory).
  statusHistory: BookingStatusHistoryEntryDetail[] | null;
  // M23-S46 — true when the booking has an OPEN worklist entry; null unless the caller asked for it
  // (includeOpenException). A view of current data, never stored on the booking.
  hasOpenException: boolean | null;
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
    @Inject(BOOKING_STATUS_TRANSITION_REPOSITORY)
    private readonly transitionRepo: IBookingStatusTransitionRepository,
    @Inject(BOOKING_STAFF_PORT) private readonly staffPort: IBookingStaffPort,
    @Inject(FUTURE_COMMITMENT_EXCEPTION_REPOSITORY)
    private readonly exceptionRepo: IFutureCommitmentExceptionRepository,
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

    const statusHistory = input.includeStatusHistory
      ? await loadStatusHistory(this.transitionRepo, this.staffPort, booking)
      : null;

    const hasOpenException = input.includeOpenException
      ? (await this.exceptionRepo.findOpenAffectedBookingIds(tenantId, [booking.id])).has(
          booking.id,
        )
      : null;

    return this.toResult(
      booking,
      cancellationWindowHours,
      reschedule,
      statusHistory,
      hasOpenException,
    );
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
      // The occupancy repository only works inside a transaction, reads included.
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

  private signPhotoUrls(paths: string[]): Promise<string[]> {
    return Promise.all(
      paths.map(async (path) => (await this.storageService.generateReadSignedUrl(path)).signedUrl),
    );
  }

  private async toResult(
    booking: Booking,
    cancellationWindowHours: number,
    reschedule: BookingRescheduleOptionsDetail | null,
    statusHistory: BookingStatusHistoryEntryDetail[] | null,
    hasOpenException: boolean | null,
  ): Promise<GetBookingByIdUseCaseResult> {
    const [beforeServicePhotoUrls, afterServicePhotoUrls] = await Promise.all([
      this.signPhotoUrls(booking.beforeServicePhotoUrls),
      this.signPhotoUrls(booking.afterServicePhotoUrls),
    ]);

    return {
      ...this.buildResult(
        booking,
        cancellationWindowHours,
        { beforeServicePhotoUrls, afterServicePhotoUrls },
        reschedule,
      ),
      statusHistory,
      hasOpenException,
    };
  }

  private buildResult(
    booking: Booking,
    cancellationWindowHours: number,
    signedPhotoUrls: { beforeServicePhotoUrls: string[]; afterServicePhotoUrls: string[] },
    reschedule: BookingRescheduleOptionsDetail | null,
  ): Omit<GetBookingByIdUseCaseResult, 'statusHistory' | 'hasOpenException'> {
    return {
      id: booking.id,
      status: booking.status,
      type: booking.type,
      customerId: booking.customerId,
      contactName: booking.contactName,
      contactEmail: booking.contactEmail.address,
      contactPhone: booking.contactPhone.value,
      contactAddress: toAddressDetail(booking.contactAddress),
      notes: booking.notes,
      scheduledAt: booking.scheduledAt.toISOString(),
      totalDurationMins: booking.totalDurationMins,
      totalPrice: toMoneyDetail(booking.totalPrice)!,
      totalActualPrice: toMoneyDetail(booking.totalActualPrice),
      discountPointsUsed: booking.discountPointsUsed,
      discountAmount: toMoneyDetail(booking.discountAmount),
      pickupAddress: toAddressDetail(booking.pickupAddress),
      lines: booking.lines.map((l) => toLineDetail(l)),
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
