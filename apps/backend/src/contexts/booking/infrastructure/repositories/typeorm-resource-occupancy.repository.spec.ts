import { EntityManager, QueryFailedError } from 'typeorm';
import { runWithEntityManager } from '../../../../shared/infrastructure/transaction-context';
import { BookingSlotUnavailableError } from '../../domain/errors/booking-domain.error';
import { ResourceType } from '../../domain/resource.types';
import { ResourceOccupancyCandidate } from '../../application/ports/resource-occupancy-repository.port';
import { ResourceOccupancyEntity } from '../entities/resource-occupancy.entity';
import { TypeOrmResourceOccupancyRepository } from './typeorm-resource-occupancy.repository';

const TENANT_ID = '00000000-0000-7000-8000-000000000001';
const BOOKING_LINE_ID = '00000000-0000-7000-8000-000000000002';

function buildCandidate(
  overrides: Partial<ResourceOccupancyCandidate> = {},
): ResourceOccupancyCandidate {
  return {
    resourceId: '00000000-0000-7000-8000-000000000003',
    resourceType: ResourceType.LOCATION,
    resourceName: 'Localização Principal',
    legIndex: null,
    quantityPosition: null,
    startsAt: new Date('2026-06-01T10:00:00.000Z'),
    endsAt: new Date('2026-06-01T11:00:00.000Z'),
    selectionMode: 'NONE',
    isBundleMember: false,
    gapMinutes: null,
    gapSource: null,
    ...overrides,
  };
}

describe('TypeOrmResourceOccupancyRepository', () => {
  let repo: TypeOrmResourceOccupancyRepository;

  beforeEach(() => {
    repo = new TypeOrmResourceOccupancyRepository();
  });

  describe('findConflictingResourceIds', () => {
    it('returns [] without querying when candidates is empty', async () => {
      const result = await repo.findConflictingResourceIds(TENANT_ID, []);
      expect(result).toEqual([]);
    });

    it('throws when called outside an active transaction', async () => {
      await expect(repo.findConflictingResourceIds(TENANT_ID, [buildCandidate()])).rejects.toThrow(
        'IResourceOccupancyRepository methods require an active transaction',
      );
    });

    it('returns the resource ids the SQL query reports as conflicting, unnesting each candidate window', async () => {
      const overlapping = buildCandidate({ resourceId: 'res-overlap' });
      const free = buildCandidate({
        resourceId: 'res-free',
        startsAt: new Date('2026-06-01T14:00:00.000Z'),
        endsAt: new Date('2026-06-01T15:00:00.000Z'),
      });
      const manager = {
        query: jest.fn().mockResolvedValue([{ position: '1' }]),
      } as unknown as EntityManager;

      const result = await runWithEntityManager(manager, () =>
        repo.findConflictingResourceIds(TENANT_ID, [overlapping, free]),
      );

      expect(result).toEqual(['res-overlap']);
      expect(manager.query).toHaveBeenCalledWith(expect.any(String), [
        TENANT_ID,
        ['res-overlap', 'res-free'],
        [overlapping.startsAt, free.startsAt],
        [overlapping.endsAt, free.endsAt],
        null,
      ]);
    });

    it('passes excludeBookingLineIds through when provided', async () => {
      const manager = { query: jest.fn().mockResolvedValue([]) } as unknown as EntityManager;
      const candidate = buildCandidate();

      await runWithEntityManager(manager, () =>
        repo.findConflictingResourceIds(TENANT_ID, [candidate], [BOOKING_LINE_ID]),
      );

      expect(manager.query).toHaveBeenCalledWith(expect.any(String), [
        TENANT_ID,
        [candidate.resourceId],
        [candidate.startsAt],
        [candidate.endsAt],
        [BOOKING_LINE_ID],
      ]);
    });

    it('collapses several conflicting windows of one resource into a single resource id', async () => {
      const first = buildCandidate({ resourceId: 'res-busy' });
      const second = buildCandidate({
        resourceId: 'res-busy',
        startsAt: new Date('2026-06-08T10:00:00.000Z'),
        endsAt: new Date('2026-06-08T11:00:00.000Z'),
      });
      const manager = {
        query: jest.fn().mockResolvedValue([{ position: '1' }, { position: '2' }]),
      } as unknown as EntityManager;

      const result = await runWithEntityManager(manager, () =>
        repo.findConflictingResourceIds(TENANT_ID, [first, second]),
      );

      expect(result).toEqual(['res-busy']);
    });
  });

  describe('findConflictingWindows', () => {
    it('returns [] without querying when windows is empty', async () => {
      const result = await repo.findConflictingWindows(TENANT_ID, []);
      expect(result).toEqual([]);
    });

    it('throws when called outside an active transaction', async () => {
      await expect(repo.findConflictingWindows(TENANT_ID, [buildCandidate()])).rejects.toThrow(
        'IResourceOccupancyRepository methods require an active transaction',
      );
    });

    it('maps each reported 1-based position back to the input window that conflicted, in one query', async () => {
      const windows = [
        buildCandidate({ resourceId: 'res-a' }),
        buildCandidate({
          resourceId: 'res-a',
          startsAt: new Date('2026-06-08T10:00:00.000Z'),
          endsAt: new Date('2026-06-08T11:00:00.000Z'),
        }),
        buildCandidate({
          resourceId: 'res-a',
          startsAt: new Date('2026-06-15T10:00:00.000Z'),
          endsAt: new Date('2026-06-15T11:00:00.000Z'),
        }),
      ];
      const manager = {
        query: jest.fn().mockResolvedValue([{ position: '2' }, { position: '3' }]),
      } as unknown as EntityManager;

      const result = await runWithEntityManager(manager, () =>
        repo.findConflictingWindows(TENANT_ID, windows),
      );

      expect(result).toEqual([windows[1], windows[2]]);
      expect(manager.query).toHaveBeenCalledTimes(1);
      expect(manager.query).toHaveBeenCalledWith(expect.any(String), [
        TENANT_ID,
        ['res-a', 'res-a', 'res-a'],
        windows.map((w) => w.startsAt),
        windows.map((w) => w.endsAt),
        null,
      ]);
    });
  });

  describe('assign', () => {
    it('is a no-op when candidates is empty', async () => {
      await expect(
        repo.assign(TENANT_ID, BOOKING_LINE_ID, [], 'HOLD', null),
      ).resolves.toBeUndefined();
    });

    it('throws when called outside an active transaction', async () => {
      await expect(
        repo.assign(TENANT_ID, BOOKING_LINE_ID, [buildCandidate()], 'HOLD', null),
      ).rejects.toThrow('IResourceOccupancyRepository methods require an active transaction');
    });

    // The assignment upsert is the first query of assign(); the occupancy insert is the second. The
    // second is one INSERT ... SELECT FROM unnest(...) binding one array per column.
    function mockManager(
      assignments: { id: string; candidate: ResourceOccupancyCandidate }[],
      occupancyInsert: 'ok' | Error = 'ok',
    ): EntityManager {
      const query = jest.fn().mockResolvedValueOnce(
        assignments.map(({ id, candidate }) => ({
          id,
          resource_id: candidate.resourceId,
          leg_index: candidate.legIndex,
          quantity_position: candidate.quantityPosition,
        })),
      );
      if (occupancyInsert === 'ok') query.mockResolvedValueOnce([]);
      else query.mockRejectedValueOnce(occupancyInsert);
      return { query } as unknown as EntityManager;
    }

    const occupancyInsertParams = (manager: EntityManager): unknown[][] =>
      (manager.query as jest.Mock).mock.calls[1][1] as unknown[][];

    it('upserts the booking_line_resource_assignments row and inserts one resource_occupancy row per candidate', async () => {
      const assignmentId = '00000000-0000-7000-8000-000000000099';
      const candidate = buildCandidate();
      const manager = mockManager([{ id: assignmentId, candidate }]);
      const holdExpiresAt = new Date('2026-06-01T10:30:00.000Z');

      await runWithEntityManager(manager, () =>
        repo.assign(TENANT_ID, BOOKING_LINE_ID, [candidate], 'HOLD', holdExpiresAt),
      );

      expect(manager.query).toHaveBeenCalledTimes(2);
      expect(manager.query).toHaveBeenNthCalledWith(
        1,
        expect.stringContaining('INSERT INTO booking.booking_line_resource_assignments'),
        expect.arrayContaining([TENANT_ID, BOOKING_LINE_ID, [candidate.resourceId]]),
      );
      expect(manager.query).toHaveBeenNthCalledWith(
        2,
        expect.stringContaining('INSERT INTO booking.resource_occupancy'),
        expect.any(Array),
      );
      const params = occupancyInsertParams(manager);
      expect(params[1]).toEqual([TENANT_ID]);
      expect(params[2]).toEqual([candidate.resourceId]);
      expect(params[4]).toEqual(['BOOKING_LINE']);
      expect(params[5]).toEqual([assignmentId]);
      expect(params[9]).toEqual([candidate.startsAt]);
      expect(params[10]).toEqual([candidate.endsAt]);
      expect(params[11]).toEqual(['HOLD']);
      expect(params[12]).toEqual([holdExpiresAt]);
    });

    it('batches 3+ candidates into one upsert query and one occupancy insert, not 2xN sequential queries', async () => {
      const candidates = [
        buildCandidate({ resourceId: 'res-1', legIndex: 0 }),
        buildCandidate({ resourceId: 'res-2', legIndex: 1 }),
        buildCandidate({ resourceId: 'res-3', legIndex: 2 }),
      ];
      // Deliberately returned out of candidate order (index 2, 0, 1) — a real UNION ALL of the
      // insert arm + fallback SELECT gives no ordering guarantee, so this proves the mapping is by
      // (resource_id, leg_index, quantity_position) tuple key, not by result-row position.
      const manager = mockManager(
        [2, 0, 1].map((i) => ({ id: `assignment-${i}`, candidate: candidates[i] })),
      );

      await runWithEntityManager(manager, () =>
        repo.assign(TENANT_ID, BOOKING_LINE_ID, candidates, 'COMMITTED', null),
      );

      expect(manager.query).toHaveBeenCalledTimes(2);
      const params = occupancyInsertParams(manager);
      // Occupancy rows stay in candidate order regardless of the query result's own row order,
      // and each one carries the assignment id that actually matches its own tuple key.
      expect(params[2]).toEqual(['res-1', 'res-2', 'res-3']);
      expect(params[5]).toEqual(['assignment-0', 'assignment-1', 'assignment-2']);
    });

    it('inserts any number of candidates in one statement with a fixed 14 parameters', async () => {
      const CANDIDATE_COUNT = 5000;
      const candidates = Array.from({ length: CANDIDATE_COUNT }, (_, i) =>
        buildCandidate({ resourceId: `res-${i}`, legIndex: i }),
      );
      const manager = mockManager(
        candidates.map((candidate, i) => ({ id: `assignment-${i}`, candidate })),
      );

      await runWithEntityManager(manager, () =>
        repo.assign(TENANT_ID, BOOKING_LINE_ID, candidates, 'COMMITTED', null),
      );

      // 5000 rows × 14 columns would be 70,000 bound parameters as a plain multi-row INSERT,
      // past PostgreSQL's 65,535 limit. Unnested, it is one statement and 14 arrays.
      expect(manager.query).toHaveBeenCalledTimes(2);
      const params = occupancyInsertParams(manager);
      expect(params).toHaveLength(16);
      expect(params.every((column) => column.length === CANDIDATE_COUNT)).toBe(true);
    });

    it('reuses an already-existing assignment row for the same (line, resource, leg, quantity) tuple', async () => {
      const existingAssignmentId = '00000000-0000-7000-8000-000000000098';
      const candidate = buildCandidate();
      // ON CONFLICT DO NOTHING returns no row from the INSERT arm — the UNION ALL fallback yields
      // the pre-existing row's id instead, exercised here via the mock's single result.
      const manager = mockManager([{ id: existingAssignmentId, candidate }]);

      await runWithEntityManager(manager, () =>
        repo.assign(TENANT_ID, BOOKING_LINE_ID, [candidate], 'COMMITTED', null),
      );

      expect(occupancyInsertParams(manager)[5]).toEqual([existingAssignmentId]);
    });

    it('maps a GIST exclusion-constraint violation to BookingSlotUnavailableError', async () => {
      const candidate = buildCandidate();
      const manager = mockManager(
        [{ id: '00000000-0000-7000-8000-000000000099', candidate }],
        new QueryFailedError(
          'INSERT INTO booking.resource_occupancy ...',
          [],
          Object.assign(new Error(), {
            code: '23P01',
            constraint: 'EX_booking_resource_occupancy_locked_window',
          }),
        ),
      );

      await expect(
        runWithEntityManager(manager, () =>
          repo.assign(TENANT_ID, BOOKING_LINE_ID, [candidate], 'HOLD', null),
        ),
      ).rejects.toBeInstanceOf(BookingSlotUnavailableError);
    });

    it('propagates an unrelated insert error unchanged', async () => {
      const unrelated = new Error('connection reset');
      const candidate = buildCandidate();
      const manager = mockManager(
        [{ id: '00000000-0000-7000-8000-000000000099', candidate }],
        unrelated,
      );

      await expect(
        runWithEntityManager(manager, () =>
          repo.assign(TENANT_ID, BOOKING_LINE_ID, [candidate], 'HOLD', null),
        ),
      ).rejects.toBe(unrelated);
    });
  });

  describe('release', () => {
    it('is a no-op when bookingLineIds is empty', async () => {
      await expect(repo.release(TENANT_ID, [])).resolves.toBeUndefined();
    });

    it('throws when called outside an active transaction', async () => {
      await expect(repo.release(TENANT_ID, [BOOKING_LINE_ID])).rejects.toThrow(
        'IResourceOccupancyRepository methods require an active transaction',
      );
    });

    it('deletes only resource_occupancy rows, never the immutable assignment record', async () => {
      const manager = { query: jest.fn().mockResolvedValue(undefined) } as unknown as EntityManager;

      await runWithEntityManager(manager, () => repo.release(TENANT_ID, [BOOKING_LINE_ID]));

      expect(manager.query).toHaveBeenCalledTimes(1);
      expect(manager.query).toHaveBeenCalledWith(
        expect.stringContaining('DELETE FROM booking.resource_occupancy'),
        [TENANT_ID, [BOOKING_LINE_ID]],
      );
      expect(manager.query).not.toHaveBeenCalledWith(
        expect.stringContaining('DELETE FROM booking.booking_line_resource_assignments'),
        expect.anything(),
      );
    });
  });

  describe('deleteOlderThan', () => {
    const cutoff = new Date('2026-06-01T00:00:00.000Z');

    function mockQueryBuilderManager(affected: number | null): {
      manager: EntityManager;
      queryBuilder: {
        delete: jest.Mock;
        from: jest.Mock;
        where: jest.Mock;
        execute: jest.Mock;
      };
    } {
      const queryBuilder = {
        delete: jest.fn(),
        from: jest.fn(),
        where: jest.fn(),
        execute: jest.fn().mockResolvedValue({ affected }),
      };
      queryBuilder.delete.mockReturnValue(queryBuilder);
      queryBuilder.from.mockReturnValue(queryBuilder);
      queryBuilder.where.mockReturnValue(queryBuilder);
      const manager = {
        createQueryBuilder: jest.fn().mockReturnValue(queryBuilder),
      } as unknown as EntityManager;
      return { manager, queryBuilder };
    }

    it('throws when called outside an active transaction', async () => {
      await expect(repo.deleteOlderThan(cutoff)).rejects.toThrow(
        'IResourceOccupancyRepository methods require an active transaction',
      );
    });

    it('issues one query-builder DELETE with no tenant_id predicate and returns the deleted row count', async () => {
      const { manager, queryBuilder } = mockQueryBuilderManager(2);

      const result = await runWithEntityManager(manager, () => repo.deleteOlderThan(cutoff));

      expect(result).toBe(2);
      expect(queryBuilder.from).toHaveBeenCalledWith(ResourceOccupancyEntity);
      expect(queryBuilder.where).toHaveBeenCalledWith('ends_at < :cutoff', { cutoff });
      expect(queryBuilder.where).not.toHaveBeenCalledWith(
        expect.stringContaining('tenant_id'),
        expect.anything(),
      );
    });

    it('returns 0 when nothing matches the cutoff', async () => {
      const { manager } = mockQueryBuilderManager(0);

      const result = await runWithEntityManager(manager, () => repo.deleteOlderThan(cutoff));

      expect(result).toBe(0);
    });

    it('normalizes a null affected count to 0', async () => {
      const { manager } = mockQueryBuilderManager(null);

      const result = await runWithEntityManager(manager, () => repo.deleteOlderThan(cutoff));

      expect(result).toBe(0);
    });
  });
});
