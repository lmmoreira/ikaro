import { Inject, Injectable } from '@nestjs/common';
import {
  FUTURE_COMMITMENT_EXCEPTION_REPOSITORY,
  IFutureCommitmentExceptionRepository,
} from '../ports/future-commitment-exception-repository.port';

export interface CountFutureCommitmentExceptionsUseCaseInput {
  tenantId: string;
}

export interface CountFutureCommitmentExceptionsUseCaseResult {
  count: number;
}

// UC-073 — how many entries still wait for the manager's decision. The sidebar badge reads this on
// every dashboard page, so it is a count query, never the list.
@Injectable()
export class CountFutureCommitmentExceptionsUseCase {
  constructor(
    @Inject(FUTURE_COMMITMENT_EXCEPTION_REPOSITORY)
    private readonly exceptionRepo: IFutureCommitmentExceptionRepository,
  ) {}

  async execute(
    input: CountFutureCommitmentExceptionsUseCaseInput,
  ): Promise<CountFutureCommitmentExceptionsUseCaseResult> {
    const count = await this.exceptionRepo.countByTenant(input.tenantId, { status: 'OPEN' });
    return { count };
  }
}
