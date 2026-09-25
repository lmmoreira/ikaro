import {
  IResourceOccupancyRepository,
  ResourceLineAssignment,
  ResourceOccupancyCandidate,
  ResourceOccupancyWindow,
} from '../../../contexts/booking/application/ports/resource-occupancy-repository.port';
import { ResourceOccupancyLockState } from '../../../contexts/booking/domain/resource-occupancy-lock-state';

interface StoredOccupancy extends ResourceOccupancyCandidate {
  tenantId: string;
  bookingLineId: string;
  lockState: ResourceOccupancyLockState;
  holdExpiresAt: Date | null;
}

export class InMemoryResourceOccupancyRepository implements IResourceOccupancyRepository {
  private store: StoredOccupancy[] = [];

  // Test-only helper — lets a spec seed an existing occupancy row without going through assign().
  seed(tenantId: string, bookingLineId: string, candidate: ResourceOccupancyCandidate): void {
    this.store.push({
      ...candidate,
      tenantId,
      bookingLineId,
      lockState: 'COMMITTED',
      holdExpiresAt: null,
    });
  }

  async findConflictingResourceIds(
    tenantId: string,
    candidates: ResourceOccupancyWindow[],
    excludeBookingLineIds?: string[],
  ): Promise<string[]> {
    const conflicting = new Set<string>();
    for (const candidate of candidates) {
      // Mirrors the production GIST exclusion constraint's own WHERE clause and
      // typeorm-resource-occupancy.repository.ts's findConflictingResourceIds SQL — REQUESTED
      // rows are never conflicts, only HOLD/COMMITTED are.
      const hasOverlap = this.store.some(
        (row) =>
          row.tenantId === tenantId &&
          row.resourceId === candidate.resourceId &&
          row.lockState !== 'REQUESTED' &&
          !(excludeBookingLineIds ?? []).includes(row.bookingLineId) &&
          candidate.startsAt < row.endsAt &&
          row.startsAt < candidate.endsAt,
      );
      if (hasOverlap) conflicting.add(candidate.resourceId);
    }
    return [...conflicting];
  }

  async assign(
    tenantId: string,
    bookingLineId: string,
    candidates: ResourceOccupancyCandidate[],
    lockState: ResourceOccupancyLockState,
    holdExpiresAt: Date | null,
  ): Promise<void> {
    for (const candidate of candidates) {
      this.store.push({ ...candidate, tenantId, bookingLineId, lockState, holdExpiresAt });
    }
  }

  async release(tenantId: string, bookingLineIds: string[]): Promise<void> {
    this.store = this.store.filter(
      (row) => !(row.tenantId === tenantId && bookingLineIds.includes(row.bookingLineId)),
    );
  }

  // TD40 Story 2 — deliberately cross-tenant, no tenantId filter, matching the port's contract.
  async deleteOlderThan(cutoff: Date): Promise<number> {
    const before = this.store.length;
    this.store = this.store.filter((row) => row.endsAt >= cutoff);
    return before - this.store.length;
  }

  async countActiveByResource(
    tenantId: string,
    resourceIds: string[],
    from: Date,
    to: Date,
    excludeBookingLineIds?: string[],
  ): Promise<Map<string, number>> {
    const counts = new Map<string, number>();
    for (const row of this.store) {
      if (
        row.tenantId !== tenantId ||
        row.lockState === 'REQUESTED' ||
        !resourceIds.includes(row.resourceId) ||
        (excludeBookingLineIds ?? []).includes(row.bookingLineId) ||
        !(row.startsAt < to && from < row.endsAt)
      ) {
        continue;
      }
      counts.set(row.resourceId, (counts.get(row.resourceId) ?? 0) + 1);
    }
    return counts;
  }

  // Mirrors the real repository's ORDER BY quantity_position — this store only ever holds live
  // occupancy (release() removes rows outright, same effect as the real query's JOIN to the live
  // resource_occupancy projection), so no separate staleness filter is needed here.
  async findAssignmentsByBookingLines(
    tenantId: string,
    bookingLineIds: string[],
  ): Promise<ResourceLineAssignment[]> {
    // Mirrors the TypeORM adapter's ORDER BY: primarily by each row's own bookingLineId's
    // position within the caller-supplied bookingLineIds array, quantityPosition as the secondary
    // tiebreaker — see that adapter's own doc comment for why (two lines booking the same
    // duplicated service must group their own assignments together, in resolution order).
    return this.store
      .filter((row) => row.tenantId === tenantId && bookingLineIds.includes(row.bookingLineId))
      .sort((a, b) => {
        const linePositionDiff =
          bookingLineIds.indexOf(a.bookingLineId) - bookingLineIds.indexOf(b.bookingLineId);
        return linePositionDiff !== 0
          ? linePositionDiff
          : (a.quantityPosition ?? -1) - (b.quantityPosition ?? -1);
      })
      .map((row) => ({
        bookingLineId: row.bookingLineId,
        resourceId: row.resourceId,
        resourceType: row.resourceType,
        legIndex: row.legIndex,
      }));
  }
}
