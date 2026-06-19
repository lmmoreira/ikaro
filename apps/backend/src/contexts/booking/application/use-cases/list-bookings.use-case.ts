import { Inject, Injectable } from '@nestjs/common';
import { TenantContext } from '../../../../shared/tenant/tenant-context';
import { formatMoney } from '../../../../shared/utils/money-format';
import { BOOKING_REPOSITORY, IBookingRepository } from '../ports/booking-repository.port';
import {
  ITenantLocalizationPort,
  TENANT_LOCALIZATION_PORT,
} from '../ports/tenant-localization.port';
import { ListBookingsDto } from '../dtos/list-bookings.dto';
import { Booking } from '../../domain/booking.aggregate';

export interface BookingLineSummary {
  serviceId: string;
  serviceNameAtBooking: string;
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
}

export interface ListBookingsUseCaseResult {
  items: BookingListItem[];
  pagination: { limit: number; offset: number; total: number; hasMore: boolean };
}

@Injectable()
export class ListBookingsUseCase {
  constructor(
    @Inject(BOOKING_REPOSITORY) private readonly bookingRepo: IBookingRepository,
    @Inject(TENANT_LOCALIZATION_PORT)
    private readonly localizationPort: ITenantLocalizationPort,
    private readonly tenantContext: TenantContext,
  ) {}

  async execute(dto: ListBookingsDto): Promise<ListBookingsUseCaseResult> {
    const { tenantId, actorId, actorRole } = this.tenantContext;

    const isStaffOrManager = actorRole === 'MANAGER' || actorRole === 'STAFF';
    const customerId = isStaffOrManager ? undefined : (actorId ?? undefined);

    const { items, total } = await this.bookingRepo.findAllByTenantPaginated(tenantId, {
      status: dto.status,
      customerId,
      scheduledAfter: dto.from ? new Date(dto.from) : undefined,
      scheduledBefore: dto.to ? new Date(dto.to) : undefined,
      limit: dto.limit,
      offset: dto.offset,
    });

    const { locale } = await this.localizationPort.getLocalization(tenantId);
    return {
      items: items.map((b) => this.toListItem(b, locale)),
      pagination: {
        limit: dto.limit,
        offset: dto.offset,
        total,
        hasMore: dto.offset + dto.limit < total,
      },
    };
  }

  private toListItem(booking: Booking, locale: string): BookingListItem {
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
        formatted: formatMoney(
          booking.totalPrice.amount.toFixed(2),
          locale,
          booking.totalPrice.currency,
        ),
      },
      lineSummary: booking.lines.map((l) => ({
        serviceId: l.serviceId,
        serviceNameAtBooking: l.serviceNameAtBooking,
        priceAtBooking: {
          amount: l.priceAtBooking.amount.toNumber(),
          currency: l.priceAtBooking.currency,
          formatted: formatMoney(
            l.priceAtBooking.amount.toFixed(2),
            locale,
            l.priceAtBooking.currency,
          ),
        },
      })),
      createdAt: booking.createdAt.toISOString(),
    };
  }
}
