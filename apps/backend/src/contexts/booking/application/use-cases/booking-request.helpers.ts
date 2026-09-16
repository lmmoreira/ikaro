import type { AddressSpec } from '@ikaro/i18n';
import { ITransactionManager } from '../../../../shared/ports/transaction-manager.port';
import { AvailabilityService } from '../../domain/services/availability.service';
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
import { IResourceOccupancyRepository } from '../ports/resource-occupancy-repository.port';
import { IResourceRepository } from '../ports/resource-repository.port';
import { IServiceRepository } from '../ports/service-repository.port';
import { BookingSlotConflictService } from '../services/booking-slot-conflict.service';
import {
  PhotoPromotionOperation,
  PhotoExistenceService,
} from '../services/photo-existence.service';
import { BookingRequestResult } from './booking-request.types';
import { assignBookingLinesOccupancy } from './resource-occupancy-assignment.helpers';
import {
  resolveBookingLinesResourceCandidates,
  ResolvedLineCandidates,
} from './resource-occupancy.helpers';

const DEFAULT_MANUAL_HOLD_MINUTES = 30; // platform default, docs/02-DOMAIN_MODEL.md

export interface PersistRequestedBookingParams {
  booking: Booking;
  tenantId: string;
  scheduledAt: Date;
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

// Locks every referenced Service row, in one round trip, before this booking becomes its first
// booking history — serializes against UpdateServiceUseCase's own findByIdForUpdate()-guarded
// bookingModel change, closing the TOCTOU race where a service's model could change concurrently
// with its very first booking being created (UC-056's immutable-after-history invariant).
// lockBookingModels() issues a single locked `SELECT ... WHERE id IN (...) FOR UPDATE` rather than
// N sequential findByIdForUpdate() calls (each of which would hydrate the full aggregate,
// including child rows this check never needs) — one statement locking every matching row also
// sidesteps the classic opposite-order deadlock a loop of individual per-row lock statements
// could otherwise hit between two concurrent multi-service bookings. Re-checks each lock's fresh
// bookingModel against the pre-transaction snapshot (not just acquiring-and-discarding it) — a
// lock only orders callers who both acquire it, it doesn't make an already-captured in-memory
// read fresh.
async function lockAndVerifyServiceModels(
  serviceRepo: IServiceRepository,
  serviceIds: string[],
  tenantId: string,
  serviceMap: Map<string, Service>,
): Promise<void> {
  const lockedBookingModels = await serviceRepo.lockBookingModels(serviceIds, tenantId);
  for (const serviceId of serviceIds) {
    const lockedModel = lockedBookingModels.get(serviceId);
    const snapshot = serviceMap.get(serviceId);
    if (lockedModel === undefined || lockedModel !== snapshot?.bookingModel) {
      throw new BookingServiceConcurrentModificationError(serviceId);
    }
  }
}

// Every booking starts PENDING (Booking.requestBooking()) — HOLD, not COMMITTED; approval
// converts it (approve-booking.use-case.ts). Hold duration = the longest manualHoldMinutes among
// this booking's own services, so no line's hold expires before its service's own configured
// grace period.
function resolveHoldExpiresAt(serviceMap: Map<string, Service>): Date {
  const holdMinutes = Math.max(
    DEFAULT_MANUAL_HOLD_MINUTES,
    ...[...serviceMap.values()].map(
      (s) => s.bookingPolicy.manualHoldMinutes ?? DEFAULT_MANUAL_HOLD_MINUTES,
    ),
  );
  return new Date(Date.now() + holdMinutes * 60_000);
}

// Resolves every line's concrete resource(s)/window(s) (pure, no I/O beyond resource lookups) and
// checks them for conflicts — both the slot-free check and the eventual insert need the exact
// same resolution, so it happens once. No excludeBookingId — this is a brand-new booking, nothing
// of its own can exist yet to self-conflict with. Must stay inside the write transaction because
// lockResources uses pg_advisory_xact_lock, which only protects the slot check for this tx.
async function resolveAndCheckCandidates(
  resourceRepo: IResourceRepository,
  availabilityService: AvailabilityService,
  slotConflictService: BookingSlotConflictService,
  booking: Booking,
  tenantId: string,
  scheduledAt: Date,
  serviceMap: Map<string, Service>,
): Promise<Map<string, ResolvedLineCandidates>> {
  const candidatesByLine = await resolveBookingLinesResourceCandidates(
    resourceRepo,
    availabilityService,
    tenantId,
    scheduledAt,
    booking.lines.map((line) => ({
      lineId: line.lineId,
      serviceId: line.serviceId,
      durationMinsAtBooking: line.durationMinsAtBooking,
    })),
    serviceMap,
  );
  const allCandidates = [...candidatesByLine.values()].flatMap((v) => v.candidates);
  await slotConflictService.assertSlotFree(tenantId, allCandidates);
  return candidatesByLine;
}

export async function persistRequestedBooking(
  txManager: ITransactionManager,
  slotConflictService: BookingSlotConflictService,
  bookingRepo: IBookingRepository,
  photoExistenceService: PhotoExistenceService,
  serviceRepo: IServiceRepository,
  resourceRepo: IResourceRepository,
  occupancyRepo: IResourceOccupancyRepository,
  availabilityService: AvailabilityService,
  params: PersistRequestedBookingParams,
): Promise<void> {
  const { booking, tenantId, scheduledAt, operations, serviceMap } = params;

  await txManager.run(async () => {
    const candidatesByLine = await resolveAndCheckCandidates(
      resourceRepo,
      availabilityService,
      slotConflictService,
      booking,
      tenantId,
      scheduledAt,
      serviceMap,
    );

    const serviceIds = [...new Set(booking.lines.map((line) => line.serviceId))];
    await lockAndVerifyServiceModels(serviceRepo, serviceIds, tenantId, serviceMap);
    await bookingRepo.save(booking);

    const holdExpiresAt = resolveHoldExpiresAt(serviceMap);
    await assignBookingLinesOccupancy(
      occupancyRepo,
      candidatesByLine,
      tenantId,
      'HOLD',
      holdExpiresAt,
    );

    await txManager.scheduleAfterCommit(() =>
      photoExistenceService.executePhotoPromotion(operations),
    );
  });
}
