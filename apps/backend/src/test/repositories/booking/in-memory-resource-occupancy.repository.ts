import {
  IResourceOccupancyRepository,
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
      const hasOverlap = this.store.some(
        (row) =>
          row.tenantId === tenantId &&
          row.resourceId === candidate.resourceId &&
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

  async commit(tenantId: string, bookingLineIds: string[]): Promise<void> {
    for (const row of this.store) {
      if (row.tenantId === tenantId && bookingLineIds.includes(row.bookingLineId)) {
        row.lockState = 'COMMITTED';
      }
    }
  }

  async findAssignedLineIds(tenantId: string, bookingLineIds: string[]): Promise<Set<string>> {
    const assigned = new Set<string>();
    for (const row of this.store) {
      if (row.tenantId === tenantId && bookingLineIds.includes(row.bookingLineId)) {
        assigned.add(row.bookingLineId);
      }
    }
    return assigned;
  }

  async release(tenantId: string, bookingLineIds: string[]): Promise<void> {
    this.store = this.store.filter(
      (row) => !(row.tenantId === tenantId && bookingLineIds.includes(row.bookingLineId)),
    );
  }
}
