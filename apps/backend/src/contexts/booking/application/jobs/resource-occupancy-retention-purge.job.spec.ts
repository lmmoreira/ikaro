import { InMemoryTransactionManager } from '../../../../test/infrastructure/in-memory-transaction-manager';
import { InMemoryResourceOccupancyRepository } from '../../../../test/repositories/booking/in-memory-resource-occupancy.repository';
import { ResourceType } from '../../domain/resource.types';
import { ResourceOccupancyLockState } from '../../domain/resource-occupancy-lock-state';
import { ResourceOccupancyCandidate } from '../ports/resource-occupancy-repository.port';
import { ResourceOccupancyRetentionPurgeJob } from './resource-occupancy-retention-purge.job';

const TENANT_A = '10000000-0000-7000-8000-000000000010';
const TENANT_B = '20000000-0000-7000-8000-000000000020';

const NOW = new Date('2026-09-17T03:00:00.000Z');
const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000;
const JUST_PAST_CUTOFF = new Date(NOW.getTime() - NINETY_DAYS_MS - 1000);
const JUST_BEFORE_CUTOFF = new Date(NOW.getTime() - NINETY_DAYS_MS + 1000);

function buildCandidate(endsAt: Date): ResourceOccupancyCandidate {
  return {
    resourceId: '00000000-0000-7000-8000-000000000003',
    resourceType: ResourceType.LOCATION,
    resourceName: 'Localização Principal',
    legIndex: null,
    quantityPosition: null,
    startsAt: new Date(endsAt.getTime() - 60 * 60 * 1000),
    endsAt,
    selectionMode: 'NONE',
  };
}

describe('ResourceOccupancyRetentionPurgeJob', () => {
  let resourceOccupancyRepo: InMemoryResourceOccupancyRepository;
  let txManager: InMemoryTransactionManager;
  let job: ResourceOccupancyRetentionPurgeJob;

  beforeEach(() => {
    resourceOccupancyRepo = new InMemoryResourceOccupancyRepository();
    txManager = new InMemoryTransactionManager();
    job = new ResourceOccupancyRetentionPurgeJob(resourceOccupancyRepo, txManager);
  });

  it('is a no-op when nothing is past the 90-day cutoff', async () => {
    resourceOccupancyRepo.seed(TENANT_A, 'line-1', buildCandidate(JUST_BEFORE_CUTOFF));

    const result = await job.run(NOW);

    expect(result).toEqual({ rowsDeleted: 0 });
  });

  it('deletes only rows past the 90-day cutoff, keeping ones just inside the window', async () => {
    resourceOccupancyRepo.seed(TENANT_A, 'line-expired', buildCandidate(JUST_PAST_CUTOFF));
    resourceOccupancyRepo.seed(TENANT_A, 'line-fresh', buildCandidate(JUST_BEFORE_CUTOFF));

    const result = await job.run(NOW);

    expect(result).toEqual({ rowsDeleted: 1 });
  });

  it.each<ResourceOccupancyLockState>(['REQUESTED', 'HOLD', 'COMMITTED'])(
    'deletes an expired row regardless of lock_state (%s)',
    async (lockState) => {
      const candidate = buildCandidate(JUST_PAST_CUTOFF);
      // seed() always writes 'COMMITTED' — exercise assign() directly to cover every lock_state.
      await resourceOccupancyRepo.assign(
        TENANT_A,
        'line-1',
        [candidate],
        lockState,
        lockState === 'HOLD' ? new Date(NOW.getTime() + 1000) : null,
      );

      const result = await job.run(NOW);

      expect(result).toEqual({ rowsDeleted: 1 });
    },
  );

  it('deletes expired rows across every tenant in one unscoped pass', async () => {
    resourceOccupancyRepo.seed(TENANT_A, 'line-a', buildCandidate(JUST_PAST_CUTOFF));
    resourceOccupancyRepo.seed(TENANT_B, 'line-b', buildCandidate(JUST_PAST_CUTOFF));

    const result = await job.run(NOW);

    expect(result).toEqual({ rowsDeleted: 2 });
  });

  it('is idempotent — running twice in a row deletes nothing new the second time', async () => {
    resourceOccupancyRepo.seed(TENANT_A, 'line-1', buildCandidate(JUST_PAST_CUTOFF));

    const firstRun = await job.run(NOW);
    const secondRun = await job.run(NOW);

    expect(firstRun).toEqual({ rowsDeleted: 1 });
    expect(secondRun).toEqual({ rowsDeleted: 0 });
  });
});
