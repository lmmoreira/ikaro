import type { AddressSpec } from '@ikaro/i18n';
import { ITransactionManager } from '../../../../shared/ports/transaction-manager.port';
import { Money } from '../../../../shared/value-objects/money';
import { AvailabilityService } from '../../domain/services/availability.service';
import { Booking } from '../../domain/booking.aggregate';
import { BookingAttendeeInput } from '../../domain/booking-attendee.entity';
import { BookingIntakeSnapshot } from '../../domain/booking.types';
import {
  BookingAddressValidationError,
  BookingInvalidMultipleVariableServicesError,
  BookingServiceConcurrentModificationError,
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
import { IServiceIntakeSchemaRepository } from '../ports/service-intake-schema-repository.port';
import { BookingSlotConflictService } from '../services/booking-slot-conflict.service';
import { BookingQuoteService } from '../services/booking-quote.service';
import {
  BookingIntakeValidationService,
  IntakeSubmissionInput,
} from '../services/booking-intake-validation.service';
import {
  PhotoPromotionOperation,
  PhotoExistenceService,
} from '../services/photo-existence.service';
import { assignBookingLinesOccupancy } from './resource-occupancy-assignment.helpers';
import {
  resolveBookingLinesResourceCandidates,
  ResolvedLineCandidates,
  ResourceSelectionInput,
} from './resource-occupancy.helpers';

// Transactional orchestration only — see booking-request.mapper.ts for the pure DTO/domain shape
// translation functions this file's callers also need (docs/CODE_STANDARDS.md: a function that
// awaits a port, holds a transaction, or enforces a business rule is not a "helper" in the same
// sense as a no-I/O mapper, even when both are used by the same use cases).

const DEFAULT_MANUAL_HOLD_MINUTES = 30; // platform default, docs/02-DOMAIN_MODEL.md

export interface PersistRequestedBookingParams {
  booking: Booking;
  tenantId: string;
  scheduledAt: Date;
  timezone: string;
  operations: PhotoPromotionOperation[];
  // Snapshotted pre-transaction (resolveServices()) — compared against each service's own
  // freshly-locked state below to detect (not just narrow) a concurrent bookingModel change.
  serviceMap: Map<string, Service>;
  // Customer's CUSTOMER_CHOICE picks from the request body (M23-S01) — AUTO_ANY/
  // AUTO_FUNGIBLE_POOL/NONE requirements ignore this entirely.
  resourceSelections: ResourceSelectionInput[];
}

// Bundled to keep persistRequestedBooking() under SonarCloud's max-parameters threshold (S107) —
// same shape every caller already builds from its own constructor-injected fields.
export interface PersistRequestedBookingDeps {
  txManager: ITransactionManager;
  slotConflictService: BookingSlotConflictService;
  bookingRepo: IBookingRepository;
  photoExistenceService: PhotoExistenceService;
  serviceRepo: IServiceRepository;
  resourceRepo: IResourceRepository;
  occupancyRepo: IResourceOccupancyRepository;
  availabilityService: AvailabilityService;
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
// Takes `deps`/`params` directly (not individual fields) to stay under SonarCloud's
// max-parameters threshold (S107) — same bundling `persistRequestedBooking`
// itself already uses.
async function resolveAndCheckCandidates(
  deps: PersistRequestedBookingDeps,
  params: Pick<
    PersistRequestedBookingParams,
    'booking' | 'tenantId' | 'scheduledAt' | 'timezone' | 'serviceMap' | 'resourceSelections'
  >,
): Promise<Map<string, ResolvedLineCandidates>> {
  const { booking, tenantId, scheduledAt, timezone, serviceMap, resourceSelections } = params;
  const candidatesByLine = await resolveBookingLinesResourceCandidates({
    resourceRepo: deps.resourceRepo,
    availabilityService: deps.availabilityService,
    occupancyRepo: deps.occupancyRepo,
    tenantId,
    scheduledAt,
    timezone,
    lines: booking.lines.map((line) => ({
      lineId: line.lineId,
      serviceId: line.serviceId,
      durationMinsAtBooking: line.durationMinsAtBooking,
    })),
    serviceMap,
    resourceSelections,
  });
  const allCandidates = [...candidatesByLine.values()].flatMap((v) => v.candidates);
  await deps.slotConflictService.assertSlotFree(tenantId, allCandidates);
  return candidatesByLine;
}

// M23-S02 (UC-067/068) — resolves the request's optional variable-duration/intake fields BEFORE
// the write transaction (persistRequestedBooking below), since it only reads Service/intake-schema
// state and needs no lock. Bundled deps for the same SonarCloud max-parameters reason as
// PersistRequestedBookingDeps.
export interface VariableServiceResolutionDeps {
  intakeSchemaRepo: IServiceIntakeSchemaRepository;
  quoteService: BookingQuoteService;
  intakeValidationService: BookingIntakeValidationService;
}

export type VariableServiceInput = IntakeSubmissionInput & { durationMinutes?: number };

export interface LineOverride {
  serviceId: string;
  durationMinutes: number;
  priceAtBooking: Money;
}

export interface VariableServiceResolution {
  lineOverride?: LineOverride;
  intake: BookingIntakeSnapshot | null;
  attendeeInputs: BookingAttendeeInput[];
}

const NO_VARIABLE_RESOLUTION: VariableServiceResolution = { intake: null, attendeeInputs: [] };

export async function resolveVariableServiceInputs(
  deps: VariableServiceResolutionDeps,
  serviceIds: string[],
  serviceMap: Map<string, Service>,
  tenantId: string,
  input: VariableServiceInput,
): Promise<VariableServiceResolution> {
  const variableServiceId = await findVariableServiceId(
    deps.intakeSchemaRepo,
    serviceIds,
    serviceMap,
    tenantId,
  );
  if (!variableServiceId) return NO_VARIABLE_RESOLUTION;

  const service = serviceMap.get(variableServiceId)!;
  const quote = deps.quoteService.quote(service, input.durationMinutes);
  const resolvedIntake = await deps.intakeValidationService.resolve(
    variableServiceId,
    tenantId,
    input,
  );

  return {
    lineOverride: {
      serviceId: variableServiceId,
      durationMinutes: quote.durationMinutes,
      priceAtBooking: quote.priceAtBooking,
    },
    intake: resolvedIntake.intake,
    attendeeInputs: resolvedIntake.attendeeInputs,
  };
}

// UC-067 A4 / UC-068 A4 — a request's basket may name at most one service that is
// durationPolicy=CUSTOMER_SELECTED and/or carries an active intake schema (M23-S02
// story-discovery). A CUSTOMER_SELECTED service is already known variable from the in-memory
// serviceMap (no I/O needed); only a non-CUSTOMER_SELECTED service needs the extra
// findActiveByServiceId() round trip to check for an intake schema.
async function findVariableServiceId(
  intakeSchemaRepo: IServiceIntakeSchemaRepository,
  serviceIds: string[],
  serviceMap: Map<string, Service>,
  tenantId: string,
): Promise<string | null> {
  const variableIds: string[] = [];
  for (const id of new Set(serviceIds)) {
    const service = serviceMap.get(id);
    if (!service) continue; // already validated to exist by the use case's resolveServices()
    const isCustomerSelected = service.bookingPolicy.durationPolicy === 'CUSTOMER_SELECTED';
    const hasActiveSchema =
      !isCustomerSelected && (await intakeSchemaRepo.findActiveByServiceId(id, tenantId)) !== null;
    if (isCustomerSelected || hasActiveSchema) variableIds.push(id);
  }
  if (variableIds.length > 1) throw new BookingInvalidMultipleVariableServicesError();
  return variableIds[0] ?? null;
}

export async function persistRequestedBooking(
  deps: PersistRequestedBookingDeps,
  params: PersistRequestedBookingParams,
): Promise<Map<string, ResolvedLineCandidates>> {
  const { booking, tenantId, scheduledAt, timezone, operations, serviceMap, resourceSelections } =
    params;

  return deps.txManager.run(async () => {
    const candidatesByLine = await resolveAndCheckCandidates(deps, {
      booking,
      tenantId,
      scheduledAt,
      timezone,
      serviceMap,
      resourceSelections,
    });

    const serviceIds = [...new Set(booking.lines.map((line) => line.serviceId))];
    await lockAndVerifyServiceModels(deps.serviceRepo, serviceIds, tenantId, serviceMap);
    await deps.bookingRepo.save(booking);

    const holdExpiresAt = resolveHoldExpiresAt(serviceMap);
    await assignBookingLinesOccupancy(
      deps.occupancyRepo,
      candidatesByLine,
      tenantId,
      'HOLD',
      holdExpiresAt,
    );

    await deps.txManager.scheduleAfterCommit(() =>
      deps.photoExistenceService.executePhotoPromotion(operations),
    );

    return candidatesByLine;
  });
}
