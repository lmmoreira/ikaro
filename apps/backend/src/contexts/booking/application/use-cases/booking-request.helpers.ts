import type { AddressSpec } from '@ikaro/i18n';
import { ITransactionManager } from '../../../../shared/ports/transaction-manager.port';
import { Booking } from '../../domain/booking.aggregate';
import { BookingLineInput } from '../../domain/booking-line.entity';
import {
  BookingAddressValidationError,
  BookingServiceConcurrentModificationError,
  BookingServiceNotInTenantError,
} from '../../domain/errors/booking-domain.error';
import { Service } from '../../domain/service.aggregate';
import {
  Address,
  AddressProps,
  AddressValidationError,
} from '../../../../shared/value-objects/address';
import { IBookingRepository } from '../ports/booking-repository.port';
import { IServiceRepository } from '../ports/service-repository.port';
import { BookingSlotConflictService } from '../services/booking-slot-conflict.service';
import {
  PhotoPromotionOperation,
  PhotoExistenceService,
} from '../services/photo-existence.service';
import { BookingRequestResult } from './booking-request.types';

export interface PersistRequestedBookingParams {
  booking: Booking;
  tenantId: string;
  scheduledAt: Date;
  totalDurationMins: number;
  timezone: string;
  operations: PhotoPromotionOperation[];
  // Snapshotted pre-transaction (resolveServices()) — compared against each service's own
  // freshly-locked state below to detect (not just narrow) a concurrent bookingModel change.
  serviceMap: Map<string, Service>;
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
  serviceRepo: IServiceRepository,
  params: PersistRequestedBookingParams,
): Promise<void> {
  const { booking, tenantId, scheduledAt, totalDurationMins, timezone, operations, serviceMap } =
    params;

  await txManager.run(async () => {
    await assertRequestedSlotFreeInTransaction(
      slotConflictService,
      tenantId,
      scheduledAt,
      totalDurationMins,
      timezone,
    );
    // Locks every referenced Service row before this booking becomes its first booking history —
    // serializes against UpdateServiceUseCase's own findByIdForUpdate()-guarded bookingModel
    // change, closing the TOCTOU race where a service's model could change concurrently with its
    // very first booking being created (UC-056's immutable-after-history invariant). Sorted so
    // every caller locks a multi-service booking's rows in the same order regardless of request
    // line order — otherwise two concurrent bookings with reversed service order ([A, B] vs
    // [B, A]) could each hold one lock and deadlock. Re-checks the lock's own fresh read against
    // the pre-transaction snapshot (not just acquiring-and-discarding it) — a lock only orders
    // callers who both acquire it, it doesn't make an already-captured in-memory read fresh.
    const serviceIds = [...new Set(booking.lines.map((line) => line.serviceId))].sort((a, b) =>
      a.localeCompare(b),
    );
    for (const serviceId of serviceIds) {
      const locked = await serviceRepo.findByIdForUpdate(serviceId, tenantId);
      const snapshot = serviceMap.get(serviceId);
      if (!locked || !snapshot || locked.bookingModel !== snapshot.bookingModel) {
        throw new BookingServiceConcurrentModificationError(serviceId);
      }
    }
    await bookingRepo.save(booking);
    await txManager.scheduleAfterCommit(() =>
      photoExistenceService.executePhotoPromotion(operations),
    );
  });
}
