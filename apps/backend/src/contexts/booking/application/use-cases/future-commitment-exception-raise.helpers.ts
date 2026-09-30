import { FutureCommitmentException } from '../../domain/future-commitment-exception.aggregate';
import {
  FutureCommitmentAlternative,
  FutureCommitmentExceptionAffectedType,
  FutureCommitmentExceptionSourceType,
} from '../../domain/future-commitment-exception.types';
import { IFutureCommitmentExceptionRepository } from '../ports/future-commitment-exception-repository.port';

export interface RaiseFutureCommitmentExceptionParams {
  tenantId: string;
  sourceType: FutureCommitmentExceptionSourceType;
  sourceId: string;
  affectedType: FutureCommitmentExceptionAffectedType;
  affectedId: string;
  alternatives: FutureCommitmentAlternative[];
  correlationId: string;
}

// UC-073 — idempotent: a repeated trigger for the same unresolved impact refreshes the open entry's
// advisory alternatives instead of creating (or announcing) a second one.
//
// A helper, not a use case with its own transaction: every caller (today the shared raise step
// called from inside the resource-deactivation transactions; M23-S05 next) already holds a
// txManager.run(), and a nested run() would open a second, independent transaction. The caller owns
// the transaction, exactly as for resource-occupancy-assignment.helpers.ts.
export async function raiseFutureCommitmentException(
  repo: IFutureCommitmentExceptionRepository,
  params: RaiseFutureCommitmentExceptionParams,
): Promise<FutureCommitmentException> {
  const { tenantId, sourceType, sourceId, affectedType, affectedId } = params;

  const existing = await repo.findOpenByImpact(tenantId, {
    sourceType,
    sourceId,
    affectedType,
    affectedId,
  });
  if (existing) {
    existing.refreshAlternatives(params.alternatives);
    await repo.save(existing);
    return existing;
  }

  const created = FutureCommitmentException.raise({
    tenantId,
    sourceType,
    sourceId,
    affectedType,
    affectedId,
    alternatives: params.alternatives,
    correlationId: params.correlationId,
  });
  await repo.save(created);
  return created;
}
