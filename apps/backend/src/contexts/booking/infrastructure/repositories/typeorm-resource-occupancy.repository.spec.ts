import { EntityManager, QueryFailedError } from 'typeorm';
import { runWithEntityManager } from '../../../../shared/infrastructure/transaction-context';
import { BookingSlotUnavailableError } from '../../domain/errors/booking-domain.error';
import { ResourceType } from '../../domain/resource.types';
import { ResourceOccupancyCandidate } from '../../application/ports/resource-occupancy-repository.port';
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

    it('returns resource ids whose window overlaps a conflicting row, excluding non-overlapping ones', async () => {
      const overlapping = buildCandidate({ resourceId: 'res-overlap' });
      const free = buildCandidate({
        resourceId: 'res-free',
        startsAt: new Date('2026-06-01T14:00:00.000Z'),
        endsAt: new Date('2026-06-01T15:00:00.000Z'),
      });
      const manager = {
        query: jest.fn().mockResolvedValue([
          {
            resource_id: 'res-overlap',
            starts_at: new Date('2026-06-01T09:30:00.000Z'),
            ends_at: new Date('2026-06-01T10:30:00.000Z'),
          },
        ]),
      } as unknown as EntityManager;

      const result = await runWithEntityManager(manager, () =>
        repo.findConflictingResourceIds(TENANT_ID, [overlapping, free]),
      );

      expect(result).toEqual(['res-overlap']);
      expect(manager.query).toHaveBeenCalledWith(expect.any(String), [
        TENANT_ID,
        ['res-overlap', 'res-free'],
        null,
      ]);
    });

    it('passes excludeBookingLineIds through when provided', async () => {
      const manager = { query: jest.fn().mockResolvedValue([]) } as unknown as EntityManager;

      await runWithEntityManager(manager, () =>
        repo.findConflictingResourceIds(TENANT_ID, [buildCandidate()], [BOOKING_LINE_ID]),
      );

      expect(manager.query).toHaveBeenCalledWith(expect.any(String), [
        TENANT_ID,
        [buildCandidate().resourceId],
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

    it('inserts one booking_line_resource_assignments row and one resource_occupancy row per candidate', async () => {
      const manager = { insert: jest.fn().mockResolvedValue({}) } as unknown as EntityManager;
      const holdExpiresAt = new Date('2026-06-01T10:30:00.000Z');
      const candidate = buildCandidate();

      await runWithEntityManager(manager, () =>
        repo.assign(TENANT_ID, BOOKING_LINE_ID, [candidate], 'HOLD', holdExpiresAt),
      );

      expect(manager.insert).toHaveBeenCalledTimes(2);
      expect(manager.insert).toHaveBeenNthCalledWith(
        1,
        expect.anything(),
        expect.objectContaining({
          tenantId: TENANT_ID,
          bookingLineId: BOOKING_LINE_ID,
          resourceId: candidate.resourceId,
          resourceType: candidate.resourceType,
          resourceNameAtAssignment: candidate.resourceName,
        }),
      );
      expect(manager.insert).toHaveBeenNthCalledWith(
        2,
        expect.anything(),
        expect.objectContaining({
          tenantId: TENANT_ID,
          resourceId: candidate.resourceId,
          sourceType: 'BOOKING_LINE',
          startsAt: candidate.startsAt,
          endsAt: candidate.endsAt,
          lockState: 'HOLD',
          holdExpiresAt,
        }),
      );
    });

    it('maps a GIST exclusion-constraint violation to BookingSlotUnavailableError', async () => {
      const manager = {
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
          repo.assign(TENANT_ID, BOOKING_LINE_ID, [buildCandidate()], 'HOLD', null),
        ),
      ).rejects.toBeInstanceOf(BookingSlotUnavailableError);
    });

    it('propagates an unrelated insert error unchanged', async () => {
      const unrelated = new Error('connection reset');
      const manager = {
        insert: jest.fn().mockRejectedValue(unrelated),
      } as unknown as EntityManager;

      await expect(
        runWithEntityManager(manager, () =>
          repo.assign(TENANT_ID, BOOKING_LINE_ID, [buildCandidate()], 'HOLD', null),
        ),
      ).rejects.toBe(unrelated);
    });
  });

  describe('commit', () => {
    it('is a no-op when bookingLineIds is empty', async () => {
      await expect(repo.commit(TENANT_ID, [])).resolves.toBeUndefined();
    });

    it('throws when called outside an active transaction', async () => {
      await expect(repo.commit(TENANT_ID, [BOOKING_LINE_ID])).rejects.toThrow(
        'IResourceOccupancyRepository methods require an active transaction',
      );
    });

    it('transitions matching rows to COMMITTED with hold_expires_at cleared', async () => {
      const manager = { query: jest.fn().mockResolvedValue(undefined) } as unknown as EntityManager;

      await runWithEntityManager(manager, () => repo.commit(TENANT_ID, [BOOKING_LINE_ID]));

      expect(manager.query).toHaveBeenCalledWith(
        expect.stringContaining("SET lock_state = 'COMMITTED'"),
        [TENANT_ID, [BOOKING_LINE_ID]],
      );
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

    it('deletes occupancy rows then assignment rows for the given lines', async () => {
      const manager = { query: jest.fn().mockResolvedValue(undefined) } as unknown as EntityManager;

      await runWithEntityManager(manager, () => repo.release(TENANT_ID, [BOOKING_LINE_ID]));

      expect(manager.query).toHaveBeenCalledTimes(2);
      expect(manager.query).toHaveBeenNthCalledWith(
        1,
        expect.stringContaining('DELETE FROM booking.resource_occupancy'),
        [TENANT_ID, [BOOKING_LINE_ID]],
      );
      expect(manager.query).toHaveBeenNthCalledWith(
        2,
        expect.stringContaining('DELETE FROM booking.booking_line_resource_assignments'),
        [TENANT_ID, [BOOKING_LINE_ID]],
      );
    });
  });
});
