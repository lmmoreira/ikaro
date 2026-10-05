import {
  BookingLineOccupancyAssignment,
  BookingLineOccupancyRow,
  IResourceOccupancyRepository,
  ResourceBookingImpact,
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
  private readonly bookingIdByLineId = new Map<string, string>();

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
    const conflicting = await this.findConflictingWindows(
      tenantId,
      candidates,
      excludeBookingLineIds,
    );
    return [...new Set(conflicting.map((window) => window.resourceId))];
  }

  findConflictingWindows(
    tenantId: string,
    windows: ResourceOccupancyWindow[],
    excludeBookingLineIds?: string[],
  ): Promise<ResourceOccupancyWindow[]> {
    // Mirrors the production GIST exclusion constraint's own WHERE clause and
    // typeorm-resource-occupancy.repository.ts's findConflictingWindows SQL — REQUESTED rows are
    // never conflicts, only HOLD/COMMITTED are.
    return Promise.resolve(
      windows.filter((window) =>
        this.store.some(
          (row) =>
            row.tenantId === tenantId &&
            row.resourceId === window.resourceId &&
            row.lockState !== 'REQUESTED' &&
            !(excludeBookingLineIds ?? []).includes(row.bookingLineId) &&
            window.startsAt < row.endsAt &&
            row.startsAt < window.endsAt,
        ),
      ),
    );
  }

  assign(
    tenantId: string,
    bookingLineId: string,
    candidates: ResourceOccupancyCandidate[],
    lockState: ResourceOccupancyLockState,
    holdExpiresAt: Date | null,
  ): Promise<void> {
    for (const candidate of candidates) {
      this.store.push({ ...candidate, tenantId, bookingLineId, lockState, holdExpiresAt });
    }
    return Promise.resolve();
  }

  assignMany(
    tenantId: string,
    assignments: BookingLineOccupancyAssignment[],
    lockState: ResourceOccupancyLockState,
    holdExpiresAt: Date | null,
  ): Promise<void> {
    for (const { bookingLineId, candidates } of assignments) {
      for (const candidate of candidates) {
        this.store.push({ ...candidate, tenantId, bookingLineId, lockState, holdExpiresAt });
      }
    }
    return Promise.resolve();
  }

  findActiveWindows(
    tenantId: string,
    resourceIds: string[],
    from: Date,
    to: Date,
  ): Promise<ResourceOccupancyWindow[]> {
    return Promise.resolve(
      this.store
        .filter(
          (row) =>
            row.tenantId === tenantId &&
            row.lockState !== 'REQUESTED' &&
            resourceIds.includes(row.resourceId) &&
            row.startsAt < to &&
            from < row.endsAt,
        )
        .map((row) => ({ resourceId: row.resourceId, startsAt: row.startsAt, endsAt: row.endsAt })),
    );
  }

  release(tenantId: string, bookingLineIds: string[]): Promise<void> {
    this.store = this.store.filter(
      (row) => !(row.tenantId === tenantId && bookingLineIds.includes(row.bookingLineId)),
    );
    return Promise.resolve();
  }

  // TD40 Story 2 — deliberately cross-tenant, no tenantId filter, matching the port's contract.
  deleteOlderThan(cutoff: Date): Promise<number> {
    const before = this.store.length;
    this.store = this.store.filter((row) => row.endsAt >= cutoff);
    return Promise.resolve(before - this.store.length);
  }

  countActiveByResource(
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
    return Promise.resolve(counts);
  }

  // Test-only helper — this double has no booking_lines table, so a spec that reads impacts by
  // booking states which booking owns which line explicitly.
  registerBookingLine(bookingLineId: string, bookingId: string): void {
    this.bookingIdByLineId.set(bookingLineId, bookingId);
  }

  findFutureBookingImpactsByResource(
    tenantId: string,
    resourceId: string,
    after: Date,
  ): Promise<ResourceBookingImpact[]> {
    const impacts = this.store
      .filter(
        (row) =>
          row.tenantId === tenantId &&
          row.resourceId === resourceId &&
          row.lockState !== 'REQUESTED' &&
          row.endsAt > after &&
          this.bookingIdByLineId.has(row.bookingLineId),
      )
      .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime())
      .map((row) => ({
        bookingId: this.bookingIdByLineId.get(row.bookingLineId)!,
        bookingLineId: row.bookingLineId,
        resourceType: row.resourceType,
        legIndex: row.legIndex,
        startsAt: row.startsAt,
        endsAt: row.endsAt,
      }));
    return Promise.resolve(impacts);
  }

  findOccupancyByBookingLines(
    tenantId: string,
    bookingLineIds: string[],
  ): Promise<BookingLineOccupancyRow[]> {
    const rows = this.store
      .filter((row) => row.tenantId === tenantId && bookingLineIds.includes(row.bookingLineId))
      .sort(
        (a, b) =>
          bookingLineIds.indexOf(a.bookingLineId) - bookingLineIds.indexOf(b.bookingLineId) ||
          a.startsAt.getTime() - b.startsAt.getTime(),
      )
      .map((row) => ({
        bookingLineId: row.bookingLineId,
        resourceId: row.resourceId,
        resourceType: row.resourceType,
        resourceName: row.resourceName,
        legIndex: row.legIndex,
        quantityPosition: row.quantityPosition,
        startsAt: row.startsAt,
        endsAt: row.endsAt,
        lockState: row.lockState,
        holdExpiresAt: row.holdExpiresAt,
        gapMinutes: row.gapMinutes,
        gapSource: row.gapSource,
      }));
    return Promise.resolve(rows);
  }

  // Mirrors the real repository's ORDER BY quantity_position — this store only ever holds live
  // occupancy (release() removes rows outright, same effect as the real query's JOIN to the live
  // resource_occupancy projection), so no separate staleness filter is needed here.
  findAssignmentsByBookingLines(
    tenantId: string,
    bookingLineIds: string[],
  ): Promise<ResourceLineAssignment[]> {
    // Mirrors the TypeORM adapter's ORDER BY: primarily by each row's own bookingLineId's
    // position within the caller-supplied bookingLineIds array, quantityPosition as the secondary
    // tiebreaker — see that adapter's own doc comment for why (two lines booking the same
    // duplicated service must group their own assignments together, in resolution order).
    const assignments = this.store
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
    return Promise.resolve(assignments);
  }
}
