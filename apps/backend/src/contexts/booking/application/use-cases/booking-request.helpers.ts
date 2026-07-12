import type { AddressSpec } from '@ikaro/i18n';
import { ITransactionManager } from '../../../../shared/ports/transaction-manager.port';
import { scheduleAfterCommit } from '../../../../shared/infrastructure/transaction-context';
import { Booking } from '../../domain/booking.aggregate';
import { BookingLineInput } from '../../domain/booking-line.entity';
import {
  BookingAddressValidationError,
  BookingServiceNotInTenantError,
} from '../../domain/errors/booking-domain.error';
import { Service } from '../../domain/service.aggregate';
import {
  Address,
  AddressProps,
  AddressValidationError,
} from '../../../../shared/value-objects/address';
import { IBookingRepository } from '../ports/booking-repository.port';
import { BookingSlotConflictService } from '../services/booking-slot-conflict.service';
import {
  PhotoPromotionOperation,
  PhotoExistenceService,
} from '../services/photo-existence.service';
import { AddressResult, BookingLineResult } from './request-booking.use-case';

export interface BookingRequestResult {
  bookingId: string;
  status: string;
  scheduledAt: string;
  totalPrice: { amount: number; currency: string };
  totalDurationMins: number;
  pickupAddress: AddressResult | null;
  beforeServicePhotoUrls: string[];
  lines: BookingLineResult[];
}

export function createBookingAddress(
  props: AddressProps,
  spec: AddressSpec,
  field: 'pickupAddress' | 'contactAddress',
): Address {
  try {
    return Address.create(props, spec);
  } catch (err) {
    if (err instanceof AddressValidationError) {
      throw new BookingAddressValidationError(err.message, err.code, field, err.params);
    }
    throw err;
  }
}

export function buildLineInputs(
  serviceIds: string[],
  serviceMap: Map<string, Service>,
): BookingLineInput[] {
  return serviceIds.map((serviceId) => {
    const service = serviceMap.get(serviceId);
    if (!service) throw new BookingServiceNotInTenantError(serviceId);
    return {
      serviceId: service.id,
      serviceNameAtBooking: service.name,
      priceAtBooking: service.price,
      durationMinsAtBooking: service.durationMinutes,
      pointsValueAtBooking: service.loyaltyPointsValue,
      requiresPickupAddressAtBooking: service.requiresPickupAddress,
    };
  });
}

export function toBookingResult(booking: Booking): BookingRequestResult {
  const pickup = booking.pickupAddress;
  return {
    bookingId: booking.id,
    status: booking.status,
    scheduledAt: booking.scheduledAt.toISOString(),
    totalPrice: {
      amount: booking.totalPrice.amount.toNumber(),
      currency: booking.totalPrice.currency,
    },
    totalDurationMins: booking.totalDurationMins,
    pickupAddress: pickup
      ? {
          street: pickup.street,
          number: pickup.number,
          complement: pickup.complement ?? null,
          neighborhood: pickup.neighborhood ?? null,
          city: pickup.city,
          state: pickup.state,
          zipCode: pickup.zipCode,
        }
      : null,
    beforeServicePhotoUrls: booking.beforeServicePhotoUrls ?? [],
    lines: booking.lines.map((l) => ({
      lineId: l.lineId,
      serviceId: l.serviceId,
      priceAtBooking: {
        amount: l.priceAtBooking.amount.toNumber(),
        currency: l.priceAtBooking.currency,
      },
      durationMinsAtBooking: l.durationMinsAtBooking,
      pointsValueAtBooking: l.pointsValueAtBooking,
      requiresPickupAddressAtBooking: l.requiresPickupAddressAtBooking,
    })),
  };
}

export async function assertRequestedSlotFreeInTransaction(
  slotConflictService: BookingSlotConflictService,
  tenantId: string,
  scheduledAt: Date,
  totalDurationMins: number,
  timezone: string,
): Promise<void> {
  // This validation must stay inside the write transaction because lockTenantDay
  // uses pg_advisory_xact_lock, which only protects the slot check for this tx.
  await slotConflictService.assertSlotFree(tenantId, scheduledAt, totalDurationMins, timezone);
}

export async function persistRequestedBooking(
  txManager: ITransactionManager,
  slotConflictService: BookingSlotConflictService,
  bookingRepo: IBookingRepository,
  photoExistenceService: PhotoExistenceService,
  booking: Booking,
  tenantId: string,
  scheduledAt: Date,
  totalDurationMins: number,
  timezone: string,
  operations: PhotoPromotionOperation[],
): Promise<void> {
  await txManager.run(async () => {
    await assertRequestedSlotFreeInTransaction(
      slotConflictService,
      tenantId,
      scheduledAt,
      totalDurationMins,
      timezone,
    );
    await bookingRepo.save(booking);
    await scheduleAfterCommit(() => photoExistenceService.executePhotoPromotion(operations));
  });
}
