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
  findByTenant(
    tenantId: string,
    filters?: FutureCommitmentExceptionFilters,
  ): Promise<FutureCommitmentException[]>;
  save(exception: FutureCommitmentException): Promise<void>;
}
