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
      const manager = {
        query: jest.fn().mockResolvedValue([{ id: assignmentId }]),
        insert: jest.fn().mockResolvedValue({}),
      } as unknown as EntityManager;
      const holdExpiresAt = new Date('2026-06-01T10:30:00.000Z');
      const candidate = buildCandidate();

      await runWithEntityManager(manager, () =>
        repo.assign(TENANT_ID, BOOKING_LINE_ID, [candidate], 'HOLD', holdExpiresAt),
      );

      expect(manager.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO booking.booking_line_resource_assignments'),
        expect.arrayContaining([TENANT_ID, BOOKING_LINE_ID, candidate.resourceId]),
      );
      expect(manager.insert).toHaveBeenCalledTimes(1);
      expect(manager.insert).toHaveBeenCalledWith(
        expect.anything(),
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
      );
    });

    it('reuses an already-existing assignment row for the same (line, resource, leg, quantity) tuple', async () => {
      const existingAssignmentId = '00000000-0000-7000-8000-000000000098';
      const manager = {
        // ON CONFLICT DO NOTHING returns no row from the INSERT arm — the UNION ALL fallback
        // yields the pre-existing row's id instead, exercised here via the mock's single result.
        query: jest.fn().mockResolvedValue([{ id: existingAssignmentId }]),
        insert: jest.fn().mockResolvedValue({}),
      } as unknown as EntityManager;

      await runWithEntityManager(manager, () =>
        repo.assign(TENANT_ID, BOOKING_LINE_ID, [buildCandidate()], 'COMMITTED', null),
      );

      expect(manager.insert).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ bookingLineResourceAssignmentId: existingAssignmentId }),
      );
    });

    it('maps a GIST exclusion-constraint violation to BookingSlotUnavailableError', async () => {
      const manager = {
        query: jest.fn().mockResolvedValue([{ id: '00000000-0000-7000-8000-000000000099' }]),
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
        query: jest.fn().mockResolvedValue([{ id: '00000000-0000-7000-8000-000000000099' }]),
        insert: jest.fn().mockRejectedValue(unrelated),
      } as unknown as EntityManager;

      await expect(
        runWithEntityManager(manager, () =>
          repo.assign(TENANT_ID, BOOKING_LINE_ID, [buildCandidate()], 'HOLD', null),
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
});
