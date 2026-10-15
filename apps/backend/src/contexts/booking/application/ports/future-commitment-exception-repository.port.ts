import { FutureCommitmentException } from '../../domain/future-commitment-exception.aggregate';
import {
  FutureCommitmentExceptionAffectedType,
  FutureCommitmentExceptionSourceType,
  FutureCommitmentExceptionStatus,
} from '../../domain/future-commitment-exception.types';

export const FUTURE_COMMITMENT_EXCEPTION_REPOSITORY = Symbol(
  'IFutureCommitmentExceptionRepository',
);

export interface FutureCommitmentExceptionFilters {
  status?: FutureCommitmentExceptionStatus;
  // Both together: the entries about one affected row (M23-S46 — one booking's entries).
  affectedType?: FutureCommitmentExceptionAffectedType;
  affectedId?: string;
}

export interface FutureCommitmentExceptionImpact {
  sourceType: FutureCommitmentExceptionSourceType;
  sourceId: string;
  affectedType: FutureCommitmentExceptionAffectedType;
  affectedId: string;
}

export interface IFutureCommitmentExceptionRepository {
  findById(id: string, tenantId: string): Promise<FutureCommitmentException | null>;
  // Row lock (SELECT ... FOR UPDATE) for the resolve/dismiss read-then-write: two managers acting
  // on the same entry must not both see it OPEN. Must be called inside an active transaction.
  findByIdForUpdate(id: string, tenantId: string): Promise<FutureCommitmentException | null>;
  // The still-OPEN entry for this exact impact, if any — what makes a repeated raise update
  // instead of duplicate (the partial unique index is the DB-level backstop).
  findOpenByImpact(
    tenantId: string,
    impact: FutureCommitmentExceptionImpact,
  ): Promise<FutureCommitmentException | null>;
  // Every still-OPEN entry raised by this source, locked (SELECT ... FOR UPDATE) and ordered by id
  // so concurrent batch lockers acquire in the same order. A manager resolving one of them at the
  // same moment must not both see it OPEN. Must be called inside an active transaction.
  findOpenBySourceForUpdate(
    tenantId: string,
    sourceType: FutureCommitmentExceptionSourceType,
    sourceId: string,
  ): Promise<FutureCommitmentException[]>;
  findByTenant(
    tenantId: string,
    filters?: FutureCommitmentExceptionFilters,
  ): Promise<FutureCommitmentException[]>;
  // M23-S46 — which of these bookings have at least one OPEN entry (the "Precisa de decisão"
  // marker), in one query for the whole page. An empty input returns an empty set without a query.
  findOpenAffectedBookingIds(
    tenantId: string,
    bookingIds: readonly string[],
  ): Promise<ReadonlySet<string>>;
  // How many entries match — a count query, never a load (the sidebar badge polls it).
  countByTenant(tenantId: string, filters?: FutureCommitmentExceptionFilters): Promise<number>;
  save(exception: FutureCommitmentException): Promise<void>;
}
