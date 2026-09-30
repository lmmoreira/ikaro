import { Inject, Injectable } from '@nestjs/common';
import {
  ITransactionManager,
  TRANSACTION_MANAGER,
} from '../../../../shared/ports/transaction-manager.port';
import { BookingDomainError } from '../../domain/errors/booking-domain-error.base';
import { FutureCommitmentExceptionNotFoundError } from '../../domain/errors/future-commitment-exception.error';
import {
  FUTURE_COMMITMENT_EXCEPTION_REPOSITORY,
  IFutureCommitmentExceptionRepository,
} from '../ports/future-commitment-exception-repository.port';
import { FutureCommitmentExceptionResolutionOutcome } from './resolve-future-commitment-exceptions.use-case';
import { mapSequentially } from '../../../../shared/utils/sequential';

export interface DismissFutureCommitmentExceptionsUseCaseInput {
  tenantId: string;
  staffId: string;
  correlationId: string;
  exceptionIds: string[];
  reason: string;
}

export interface DismissFutureCommitmentExceptionsUseCaseResult {
  results: FutureCommitmentExceptionResolutionOutcome[];
}

// UC-077 A2 — the manager records that an entry needs no action. Same best-effort-per-entry shape
// as resolve: each entry is its own transaction, and one that is missing or already closed is
// reported without blocking the others.
@Injectable()
export class DismissFutureCommitmentExceptionsUseCase {
  constructor(
    @Inject(FUTURE_COMMITMENT_EXCEPTION_REPOSITORY)
    private readonly exceptionRepo: IFutureCommitmentExceptionRepository,
    @Inject(TRANSACTION_MANAGER) private readonly txManager: ITransactionManager,
  ) {}

  async execute(
    input: DismissFutureCommitmentExceptionsUseCaseInput,
  ): Promise<DismissFutureCommitmentExceptionsUseCaseResult> {
    const results = await mapSequentially(input.exceptionIds, (exceptionId) =>
      this.dismissOne(input, exceptionId),
    );
    return { results };
  }

  private async dismissOne(
    input: DismissFutureCommitmentExceptionsUseCaseInput,
    exceptionId: string,
  ): Promise<FutureCommitmentExceptionResolutionOutcome> {
    const { tenantId, staffId, correlationId, reason } = input;
    try {
      await this.txManager.run(async () => {
        const exception = await this.exceptionRepo.findByIdForUpdate(exceptionId, tenantId);
        if (!exception) throw new FutureCommitmentExceptionNotFoundError(exceptionId);
        exception.dismiss(staffId, reason, correlationId);
        await this.exceptionRepo.save(exception);
      });
      return { exceptionId, outcome: 'RESOLVED' };
    } catch (err) {
      if (err instanceof BookingDomainError) {
        return { exceptionId, outcome: 'STILL_OPEN', errorCode: err.code };
      }
      throw err;
    }
  }
}
