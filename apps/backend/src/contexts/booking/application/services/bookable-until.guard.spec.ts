import { InMemoryBookableUntilLock } from '../../../../test/infrastructure/in-memory-bookable-until-lock';
import { InMemoryTenantAccessPort } from '../../../../test/infrastructure/in-memory-tenant-access.port';
import { BookingTooFarAheadError } from '../../domain/errors/booking-domain.error';
import { BookableUntilGuard } from './bookable-until.guard';

const TENANT = '10000000-0000-4000-8000-000000000100';
const OTHER_TENANT = '10000000-0000-4000-8000-000000000200';
const TIMEZONE = 'America/Sao_Paulo';
// America/Sao_Paulo has no daylight saving time since 2019: local midnight is 03:00 UTC.
const BOUNDARY = new Date('2026-12-15T03:00:00.000Z');

describe('BookableUntilGuard', () => {
  let lock: InMemoryBookableUntilLock;
  let access: InMemoryTenantAccessPort;
  let guard: BookableUntilGuard;

  beforeEach(() => {
    lock = new InMemoryBookableUntilLock();
    access = new InMemoryTenantAccessPort();
    guard = new BookableUntilGuard(lock, access);
  });

  const seedCap = (tenantId: string, bookableUntil: string | null) =>
    access.seed(tenantId, {
      status: 'ACTIVE',
      suspensionReason: null,
      operational: true,
      features: [{ key: 'BOOKING', tier: 'STANDARD' }],
      bookableUntil,
    });

  describe('acquire', () => {
    it('takes the SHARED lock for the tenant, then reads the cap uncached', async () => {
      seedCap(TENANT, '2026-12-15');

      await expect(guard.acquire(TENANT)).resolves.toBe('2026-12-15');

      expect(lock.calls).toEqual([{ mode: 'shared', tenantId: TENANT }]);
      expect(access.getBookableUntilCalls).toEqual([TENANT]);
      // The cached read is never the authority at write time.
      expect(access.getAccessCalls).toEqual([]);
    });

    it('answers null when no removal is pending', async () => {
      await expect(guard.acquire(TENANT)).resolves.toBeNull();
    });

    it('never takes the EXCLUSIVE mode: bookings must not wait for each other', async () => {
      await guard.acquire(TENANT);

      expect(lock.calls.some((call) => call.mode === 'exclusive')).toBe(false);
    });

    it('is scoped by tenant', async () => {
      seedCap(OTHER_TENANT, '2026-12-15');

      await expect(guard.acquire(TENANT)).resolves.toBeNull();
    });

    it('propagates a failed lock, and never reads the cap without it', async () => {
      jest.spyOn(lock, 'lockCommitmentsShared').mockRejectedValue(new Error('lock timeout'));

      await expect(guard.acquire(TENANT)).rejects.toThrow('lock timeout');

      expect(access.getBookableUntilCalls).toEqual([]);
    });
  });

  describe('assertEndsWithin', () => {
    it('refuses an end after the boundary with BOOKING_TOO_FAR_AHEAD', async () => {
      seedCap(TENANT, '2026-12-15');

      await expect(
        guard.assertEndsWithin(TENANT, new Date(BOUNDARY.getTime() + 60_000), TIMEZONE),
      ).rejects.toBeInstanceOf(BookingTooFarAheadError);
    });

    it('accepts an end exactly at the boundary', async () => {
      seedCap(TENANT, '2026-12-15');

      await expect(guard.assertEndsWithin(TENANT, BOUNDARY, TIMEZONE)).resolves.toBeUndefined();
    });

    it('accepts anything without a cap, and still takes the lock', async () => {
      await expect(
        guard.assertEndsWithin(TENANT, new Date('2030-01-01T00:00:00Z'), TIMEZONE),
      ).resolves.toBeUndefined();

      expect(lock.calls).toEqual([{ mode: 'shared', tenantId: TENANT }]);
    });

    it('takes the lock before it refuses, so a refused commitment still ordered itself', async () => {
      seedCap(TENANT, '2026-12-15');

      await guard
        .assertEndsWithin(TENANT, new Date('2030-01-01T00:00:00Z'), TIMEZONE)
        .catch(() => undefined);

      expect(lock.calls).toHaveLength(1);
    });
  });
});
