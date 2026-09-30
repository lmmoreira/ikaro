import { mapSequentially } from '../../../../shared/utils/sequential';
import { localDayBoundsUTC } from '../../../../shared/utils/calendar-date';
import { Booking } from '../../domain/booking.aggregate';
import { FutureCommitmentExceptionReassignTargetInvalidError } from '../../domain/errors/future-commitment-exception.error';
import { Resource } from '../../domain/resource.aggregate';
import { Service } from '../../domain/service.aggregate';
import {
  BookingLineOccupancyRow,
  IResourceOccupancyRepository,
  ResourceOccupancyWindow,
} from '../ports/resource-occupancy-repository.port';
import { IResourceRepository } from '../ports/resource-repository.port';
import { ITenantLockPort } from '../ports/tenant-lock.port';
import { findRequirementForAssignment, isInPool } from './future-commitment-alternatives.helpers';

export type ReassignTarget = { resourceId: string } | { mode: 'AUTO' };

export interface ReassignBookingDeps {
  resourceRepo: IResourceRepository;
  occupancyRepo: IResourceOccupancyRepository;
  tenantLock: ITenantLockPort;
}

export interface ReassignBookingParams {
  tenantId: string;
  booking: Booking;
  serviceMap: Map<string, Service>;
  sourceResourceId: string;
  target: ReassignTarget;
  timezone: string;
}

// UC-077 REASSIGN — moves the booking's occupancy on `sourceResourceId` to another resource at the
// exact same window: time, price and status are untouched, so the booking aggregate is not modified
// and no BookingRescheduled is emitted. Lines on other resources of a bundle keep their rows.
//
// The target is validated against the booking's own requirement(s) — active, same type, inside the
// requirement's pool, not already one of this booking's resources, and free at every affected
// window (excluding the booking's own lines). Must be called inside the caller's txManager.run():
// it takes advisory locks, then deletes and re-inserts occupancy rows.
export async function reassignBookingResource(
  deps: ReassignBookingDeps,
  params: ReassignBookingParams,
): Promise<{ targetResourceId: string }> {
  const { occupancyRepo } = deps;
  const { tenantId, booking, sourceResourceId } = params;

  const lineIds = booking.lines.map((l) => l.lineId);
  const rows = await occupancyRepo.findOccupancyByBookingLines(tenantId, lineIds);
  const affected = rows.filter((r) => r.resourceId === sourceResourceId);
  if (affected.length === 0) {
    throw new FutureCommitmentExceptionReassignTargetInvalidError(
      'the booking no longer occupies the resource',
    );
  }

  const candidates = await loadCandidates(deps, params, rows, affected);
  await deps.tenantLock.lockResources(
    tenantId,
    candidates.map((c) => c.id),
  );
  const free = await filterFreeCandidates(occupancyRepo, tenantId, candidates, affected, lineIds);
  const chosen = await pickTarget(deps, params, free, candidates, affected);

  await moveAffectedRows(occupancyRepo, tenantId, lineIds, rows, sourceResourceId, chosen);
  return { targetResourceId: chosen.id };
}

async function loadCandidates(
  deps: ReassignBookingDeps,
  params: ReassignBookingParams,
  allRows: BookingLineOccupancyRow[],
  affected: BookingLineOccupancyRow[],
): Promise<Resource[]> {
  const { tenantId, booking, serviceMap, sourceResourceId, target } = params;
  const type = affected[0].resourceType;
  const linesById = new Map(booking.lines.map((l) => [l.lineId, l]));
  const pools = affected.map(
    (row) =>
      findRequirementForAssignment(
        serviceMap.get(linesById.get(row.bookingLineId)?.serviceId ?? ''),
        row.legIndex,
        type,
      )?.resourcePoolIds ?? null,
  );
  const alreadyOnBooking = new Set(allRows.map((r) => r.resourceId));

  if ('resourceId' in target) {
    const resource = await deps.resourceRepo.findById(target.resourceId, tenantId);
    assertValidExplicitTarget(resource, type, pools, alreadyOnBooking, sourceResourceId);
    return [resource!];
  }
  const active = await deps.resourceRepo.findByTenant(tenantId, { type, isActive: true });
  return active.filter(
    (r) => !alreadyOnBooking.has(r.id) && pools.every((pool) => isInPool(pool, r.id)),
  );
}

function assertValidExplicitTarget(
  resource: Resource | null,
  type: Resource['type'],
  pools: (string[] | null)[],
  alreadyOnBooking: Set<string>,
  sourceResourceId: string,
): void {
  if (!resource) throw invalid('the resource does not exist');
  if (!resource.isActive) throw invalid('the resource is not active');
  if (resource.type !== type) throw invalid('the resource is not of the required type');
  if (resource.id === sourceResourceId || alreadyOnBooking.has(resource.id)) {
    throw invalid('the booking already uses this resource');
  }
  if (!pools.every((pool) => isInPool(pool, resource.id))) {
    throw invalid('the resource is outside the service requirement pool');
  }
}

async function filterFreeCandidates(
  occupancyRepo: IResourceOccupancyRepository,
  tenantId: string,
  candidates: Resource[],
  affected: BookingLineOccupancyRow[],
  bookingLineIds: string[],
): Promise<Resource[]> {
  const windows: ResourceOccupancyWindow[] = candidates.flatMap((c) =>
    affected.map((row) => ({ resourceId: c.id, startsAt: row.startsAt, endsAt: row.endsAt })),
  );
  const conflicting = await occupancyRepo.findConflictingWindows(tenantId, windows, bookingLineIds);
  const busy = new Set(conflicting.map((w) => w.resourceId));
  return candidates.filter((c) => !busy.has(c.id));
}

// An explicit target that is not free is an error the manager can act on; AUTO with no free
// candidate is the same outcome (the entry stays OPEN), reported through the same error.
async function pickTarget(
  deps: ReassignBookingDeps,
  params: ReassignBookingParams,
  free: Resource[],
  candidates: Resource[],
  affected: BookingLineOccupancyRow[],
): Promise<Resource> {
  if ('resourceId' in params.target) {
    if (free.length === 0) throw invalid('the resource is busy at this time');
    return free[0];
  }
  if (free.length === 0) {
    throw invalid(
      candidates.length === 0
        ? 'no eligible resource exists'
        : 'every eligible resource is busy at this time',
    );
  }
  const earliest = affected.reduce(
    (min, row) => (row.startsAt < min ? row.startsAt : min),
    affected[0].startsAt,
  );
  const { start, end } = localDayBoundsUTC(earliest, params.timezone);
  const workload = await deps.occupancyRepo.countActiveByResource(
    params.tenantId,
    free.map((r) => r.id),
    start,
    end,
  );
  return [...free].sort(
    (a, b) => (workload.get(a.id) ?? 0) - (workload.get(b.id) ?? 0) || a.id.localeCompare(b.id),
  )[0];
}

// release() deletes every row of the given lines, so the unaffected rows (other resources of a
// bundle) are re-inserted exactly as read, next to the moved ones.
async function moveAffectedRows(
  occupancyRepo: IResourceOccupancyRepository,
  tenantId: string,
  lineIds: string[],
  rows: BookingLineOccupancyRow[],
  sourceResourceId: string,
  target: Resource,
): Promise<void> {
  await occupancyRepo.release(tenantId, lineIds);
  const groups = new Map<string, BookingLineOccupancyRow[]>();
  for (const row of rows) {
    const key = `${row.bookingLineId}|${row.lockState}|${row.holdExpiresAt?.getTime() ?? ''}`;
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }
  await mapSequentially([...groups.values()], (group) => {
    const first = group[0];
    return occupancyRepo.assign(
      tenantId,
      first.bookingLineId,
      group.map((row) => {
        const moved = row.resourceId === sourceResourceId;
        return {
          resourceId: moved ? target.id : row.resourceId,
          resourceType: row.resourceType,
          resourceName: moved ? target.name : row.resourceName,
          legIndex: row.legIndex,
          quantityPosition: row.quantityPosition,
          startsAt: row.startsAt,
          endsAt: row.endsAt,
          // Persistence ignores these two (docs on ResourceOccupancyCandidate); they only shape
          // booking-creation responses.
          selectionMode: 'NONE',
          isBundleMember: false,
        };
      }),
      first.lockState,
      first.holdExpiresAt,
    );
  });
}

function invalid(reason: string): FutureCommitmentExceptionReassignTargetInvalidError {
  return new FutureCommitmentExceptionReassignTargetInvalidError(reason);
}
