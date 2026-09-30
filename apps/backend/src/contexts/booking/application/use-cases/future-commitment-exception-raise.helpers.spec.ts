import { InMemoryFutureCommitmentExceptionRepository } from '../../../../test/repositories/booking/in-memory-future-commitment-exception.repository';
import { FCE_TENANT_ID as TENANT_ID } from '../../../../test/utils/future-commitment-fixture';
import { FutureCommitmentExceptionAlreadyResolvedError } from '../../domain/errors/future-commitment-exception.error';
import { raiseFutureCommitmentException } from './future-commitment-exception-raise.helpers';

const SOURCE_ID = '00000000-0000-7000-8000-0000000000a1';
const AFFECTED_ID = '00000000-0000-7000-8000-0000000000b1';

const params = (overrides: Partial<Parameters<typeof raiseFutureCommitmentException>[1]> = {}) => ({
  tenantId: TENANT_ID,
  sourceType: 'RESOURCE_DEACTIVATION' as const,
  sourceId: SOURCE_ID,
  affectedType: 'BOOKING' as const,
  affectedId: AFFECTED_ID,
  alternatives: [],
  correlationId: 'corr-raise-helper',
  ...overrides,
});

describe('raiseFutureCommitmentException', () => {
  let repo: InMemoryFutureCommitmentExceptionRepository;

  beforeEach(() => {
    repo = new InMemoryFutureCommitmentExceptionRepository();
  });

  it('creates an OPEN entry when the impact has none', async () => {
    const created = await raiseFutureCommitmentException(repo, params());

    expect(created.status).toBe('OPEN');
    expect(await repo.findByTenant(TENANT_ID)).toHaveLength(1);
  });

  it('refreshes the still-open entry for the same impact instead of duplicating it', async () => {
    const first = await raiseFutureCommitmentException(repo, params());

    const second = await raiseFutureCommitmentException(
      repo,
      params({ alternatives: [{ resourceId: 'r-2', resourceName: 'Sala 2' }] }),
    );

    expect(second.id).toBe(first.id);
    expect(await repo.findByTenant(TENANT_ID)).toHaveLength(1);
    expect(second.alternatives).toEqual([{ resourceId: 'r-2', resourceName: 'Sala 2' }]);
  });

  it('opens a new entry for the same impact once the earlier one is closed', async () => {
    const first = await raiseFutureCommitmentException(repo, params());
    first.dismiss('staff-1', 'handled', 'corr-1');
    await repo.save(first);

    const second = await raiseFutureCommitmentException(repo, params());

    expect(second.id).not.toBe(first.id);
    expect(await repo.findByTenant(TENANT_ID)).toHaveLength(2);
    expect(() => first.refreshAlternatives([])).toThrow(
      FutureCommitmentExceptionAlreadyResolvedError,
    );
  });

  it('keeps entries for different bookings, or different tenants, separate', async () => {
    await raiseFutureCommitmentException(repo, params());
    await raiseFutureCommitmentException(
      repo,
      params({ affectedId: '00000000-0000-7000-8000-0000000000b2' }),
    );
    await raiseFutureCommitmentException(
      repo,
      params({ tenantId: '99999999-0000-7000-8000-000000000099' }),
    );

    expect(await repo.findByTenant(TENANT_ID)).toHaveLength(2);
  });
});
