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
        query: jest.fn().mockResolvedValue([{ resource_id: 'res-overlap' }]),
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

    it('upserts the booking_line_resource_assignments row and inserts one resource_occupancy row per candidate', async () => {
      const assignmentId = '00000000-0000-7000-8000-000000000099';
      const candidate = buildCandidate();
      const manager = {
        query: jest.fn().mockResolvedValue([
          {
            id: assignmentId,
            resource_id: candidate.resourceId,
            leg_index: candidate.legIndex,
            quantity_position: candidate.quantityPosition,
          },
        ]),
        insert: jest.fn().mockResolvedValue({}),
      } as unknown as EntityManager;
      const holdExpiresAt = new Date('2026-06-01T10:30:00.000Z');

      await runWithEntityManager(manager, () =>
        repo.assign(TENANT_ID, BOOKING_LINE_ID, [candidate], 'HOLD', holdExpiresAt),
      );

      expect(manager.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO booking.booking_line_resource_assignments'),
        expect.arrayContaining([TENANT_ID, BOOKING_LINE_ID, [candidate.resourceId]]),
      );
      expect(manager.insert).toHaveBeenCalledTimes(1);
      expect(manager.insert).toHaveBeenCalledWith(expect.anything(), [
        expect.objectContaining({
          tenantId: TENANT_ID,
          resourceId: candidate.resourceId,
          sourceType: 'BOOKING_LINE',
          bookingLineResourceAssignmentId: assignmentId,
          startsAt: candidate.startsAt,
          endsAt: candidate.endsAt,
          lockState: 'HOLD',
          holdExpiresAt,
        }),
      ]);
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
      const shuffledOrder = [2, 0, 1];
      const manager = {
        query: jest.fn().mockResolvedValue(
          shuffledOrder.map((i) => ({
            id: `assignment-${i}`,
            resource_id: candidates[i].resourceId,
            leg_index: candidates[i].legIndex,
            quantity_position: candidates[i].quantityPosition,
          })),
        ),
        insert: jest.fn().mockResolvedValue({}),
      } as unknown as EntityManager;

      await runWithEntityManager(manager, () =>
        repo.assign(TENANT_ID, BOOKING_LINE_ID, candidates, 'COMMITTED', null),
      );

      expect(manager.query).toHaveBeenCalledTimes(1);
      expect(manager.insert).toHaveBeenCalledTimes(1);
      const insertedRows: { resourceId: string; bookingLineResourceAssignmentId: string }[] = (
        manager.insert as jest.Mock
      ).mock.calls[0][1];
      expect(insertedRows).toHaveLength(3);
      // Occupancy rows stay in candidate order regardless of the query result's own row order,
      // and each one carries the assignment id that actually matches its own tuple key.
      expect(insertedRows.map((r) => r.resourceId)).toEqual(['res-1', 'res-2', 'res-3']);
      expect(insertedRows.map((r) => r.bookingLineResourceAssignmentId)).toEqual([
        'assignment-0',
        'assignment-1',
        'assignment-2',
      ]);
    });

    it('chunks the occupancy insert once candidate count would exceed a single multi-row statement', async () => {
      const CANDIDATE_COUNT = 1500;
      const candidates = Array.from({ length: CANDIDATE_COUNT }, (_, i) =>
        buildCandidate({ resourceId: `res-${i}`, legIndex: i }),
      );
      const manager = {
        query: jest.fn().mockResolvedValue(
          candidates.map((c, i) => ({
            id: `assignment-${i}`,
            resource_id: c.resourceId,
            leg_index: c.legIndex,
            quantity_position: c.quantityPosition,
          })),
        ),
        insert: jest.fn().mockResolvedValue({}),
      } as unknown as EntityManager;

      await runWithEntityManager(manager, () =>
        repo.assign(TENANT_ID, BOOKING_LINE_ID, candidates, 'COMMITTED', null),
      );

      // 1500 candidates at a 1000-row chunk size → 2 insert calls (1000 + 500), never one
      // statement large enough to risk PostgreSQL's 65,535 bound-parameter limit.
      expect(manager.insert).toHaveBeenCalledTimes(2);
      const [firstChunk, secondChunk] = (manager.insert as jest.Mock).mock.calls.map(
        (call) => call[1] as unknown[],
      );
      expect(firstChunk).toHaveLength(1000);
      expect(secondChunk).toHaveLength(500);
    });

    it('reuses an already-existing assignment row for the same (line, resource, leg, quantity) tuple', async () => {
      const existingAssignmentId = '00000000-0000-7000-8000-000000000098';
      const candidate = buildCandidate();
      const manager = {
        // ON CONFLICT DO NOTHING returns no row from the INSERT arm — the UNION ALL fallback
        // yields the pre-existing row's id instead, exercised here via the mock's single result.
        query: jest.fn().mockResolvedValue([
          {
            id: existingAssignmentId,
            resource_id: candidate.resourceId,
            leg_index: candidate.legIndex,
            quantity_position: candidate.quantityPosition,
          },
        ]),
        insert: jest.fn().mockResolvedValue({}),
      } as unknown as EntityManager;

      await runWithEntityManager(manager, () =>
        repo.assign(TENANT_ID, BOOKING_LINE_ID, [candidate], 'COMMITTED', null),
      );

      expect(manager.insert).toHaveBeenCalledWith(expect.anything(), [
        expect.objectContaining({ bookingLineResourceAssignmentId: existingAssignmentId }),
      ]);
    });

    it('maps a GIST exclusion-constraint violation to BookingSlotUnavailableError', async () => {
      const candidate = buildCandidate();
      const manager = {
        query: jest.fn().mockResolvedValue([
          {
            id: '00000000-0000-7000-8000-000000000099',
            resource_id: candidate.resourceId,
            leg_index: candidate.legIndex,
            quantity_position: candidate.quantityPosition,
          },
        ]),
        insert: jest.fn().mockRejectedValue(
          new QueryFailedError(
            'INSERT INTO booking.resource_occupancy ...',
            [],
            Object.assign(new Error(), {
              code: '23P01',
              constraint: 'EX_booking_resource_occupancy_locked_window',
            }),
          ),
        ),
      } as unknown as EntityManager;

      await expect(
        runWithEntityManager(manager, () =>
          repo.assign(TENANT_ID, BOOKING_LINE_ID, [candidate], 'HOLD', null),
        ),
      ).rejects.toBeInstanceOf(BookingSlotUnavailableError);
    });

    it('propagates an unrelated insert error unchanged', async () => {
      const unrelated = new Error('connection reset');
      const candidate = buildCandidate();
      const manager = {
        query: jest.fn().mockResolvedValue([
          {
            id: '00000000-0000-7000-8000-000000000099',
            resource_id: candidate.resourceId,
            leg_index: candidate.legIndex,
            quantity_position: candidate.quantityPosition,
          },
        ]),
        insert: jest.fn().mockRejectedValue(unrelated),
      } as unknown as EntityManager;

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
