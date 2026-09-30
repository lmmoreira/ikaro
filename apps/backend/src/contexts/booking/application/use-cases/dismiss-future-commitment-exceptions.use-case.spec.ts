import { BookingErrorCode } from '@ikaro/types/protocol/errors';
import { InMemoryTransactionManager } from '../../../../test/infrastructure/in-memory-transaction-manager';
import { FutureCommitmentExceptionBuilder } from '../../../../test/builders/booking/index';
import { InMemoryFutureCommitmentExceptionRepository } from '../../../../test/repositories/booking/in-memory-future-commitment-exception.repository';
import {
  FCE_OTHER_TENANT_ID,
  FCE_TENANT_ID as TENANT_ID,
} from '../../../../test/utils/future-commitment-fixture';
import { DismissFutureCommitmentExceptionsUseCase } from './dismiss-future-commitment-exceptions.use-case';

const STAFF_ID = '00000000-0000-7000-8000-0000000000aa';
const CORRELATION_ID = 'corr-dismiss-1';

describe('DismissFutureCommitmentExceptionsUseCase', () => {
  let repo: InMemoryFutureCommitmentExceptionRepository;
  let useCase: DismissFutureCommitmentExceptionsUseCase;

  beforeEach(() => {
    repo = new InMemoryFutureCommitmentExceptionRepository();
    useCase = new DismissFutureCommitmentExceptionsUseCase(repo, new InMemoryTransactionManager());
  });

  const dismiss = (exceptionIds: string[], tenantId = TENANT_ID) =>
    useCase.execute({
      tenantId,
      staffId: STAFF_ID,
      correlationId: CORRELATION_ID,
      exceptionIds,
      reason: 'already handled by phone',
    });

  it('dismisses each entry with the reason and reports RESOLVED per entry', async () => {
    const first = new FutureCommitmentExceptionBuilder().withTenantId(TENANT_ID).build();
    const second = new FutureCommitmentExceptionBuilder().withTenantId(TENANT_ID).build();
    repo.seed(first);
    repo.seed(second);

    const { results } = await dismiss([first.id, second.id]);

    expect(results).toEqual([
      { exceptionId: first.id, outcome: 'RESOLVED' },
      { exceptionId: second.id, outcome: 'RESOLVED' },
    ]);
    for (const id of [first.id, second.id]) {
      const stored = (await repo.findById(id, TENANT_ID))!;
      expect(stored.status).toBe('DISMISSED');
      expect(stored.resolutionReason).toBe('already handled by phone');
      expect(stored.resolvedByStaffId).toBe(STAFF_ID);
    }
  });

  it('reports an unknown or already-closed entry without blocking the rest', async () => {
    const closed = new FutureCommitmentExceptionBuilder().withTenantId(TENANT_ID).build();
    closed.dismiss(STAFF_ID, 'earlier', CORRELATION_ID);
    const open = new FutureCommitmentExceptionBuilder().withTenantId(TENANT_ID).build();
    repo.seed(closed);
    repo.seed(open);
    const unknown = '00000000-0000-7000-8000-00000000dead';

    const { results } = await dismiss([unknown, closed.id, open.id]);

    expect(results).toEqual([
      {
        exceptionId: unknown,
        outcome: 'STILL_OPEN',
        errorCode: BookingErrorCode.EXCEPTION_NOT_FOUND,
      },
      {
        exceptionId: closed.id,
        outcome: 'STILL_OPEN',
        errorCode: BookingErrorCode.EXCEPTION_ALREADY_RESOLVED,
      },
      { exceptionId: open.id, outcome: 'RESOLVED' },
    ]);
  });

  it("cannot dismiss another tenant's entry (tenant isolation)", async () => {
    const entry = new FutureCommitmentExceptionBuilder().withTenantId(TENANT_ID).build();
    repo.seed(entry);

    const { results } = await dismiss([entry.id], FCE_OTHER_TENANT_ID);

    expect(results[0].errorCode).toBe(BookingErrorCode.EXCEPTION_NOT_FOUND);
    expect((await repo.findById(entry.id, TENANT_ID))!.status).toBe('OPEN');
  });
});
