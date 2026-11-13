import { InMemoryTenantAccessPort } from '../../../test/infrastructure/in-memory-tenant-access.port';
import { InMemoryTenantDirectoryPort } from '../../../test/infrastructure/in-memory-tenant-directory.port';
import { AppLogger } from '../../observability/app-logger';
import { getActiveEntityManager } from '../../infrastructure/transaction-context';
import { localTimeWindow } from './local-time-window';
import { TenantJobRunner } from './tenant-job-runner';

const ACTIVE = { id: '00000000-0000-7000-8000-000000000001', timezone: 'UTC' };
const SUSPENDED = { id: '00000000-0000-7000-8000-000000000002', timezone: 'UTC' };
const NO_BOOKING = { id: '00000000-0000-7000-8000-000000000003', timezone: 'UTC' };
const NO_LOYALTY = { id: '00000000-0000-7000-8000-000000000004', timezone: 'UTC' };
const NOW = new Date('2026-10-12T09:15:00.000Z');
const LABEL = 'Test job';

describe('TenantJobRunner', () => {
  let directory: InMemoryTenantDirectoryPort;
  let access: InMemoryTenantAccessPort;
  let runner: TenantJobRunner;
  let seen: string[];
  const collect = async (tenant: { id: string }): Promise<string> => {
    seen.push(tenant.id);
    return tenant.id;
  };

  beforeEach(() => {
    directory = new InMemoryTenantDirectoryPort();
    access = new InMemoryTenantAccessPort();
    runner = new TenantJobRunner(directory, access);
    seen = [];
    directory.seed([ACTIVE, SUSPENDED, NO_BOOKING, NO_LOYALTY]);
    access.seedSuspended(SUSPENDED.id);
    access.seedNotEntitledTo('BOOKING', [NO_BOOKING.id]);
    access.seedNotEntitledTo('LOYALTY', [NO_LOYALTY.id]);
  });

  afterEach(() => jest.restoreAllMocks());

  it('processes operational tenants only, in directory order', async () => {
    const results = await runner.forEachTenant({ label: LABEL }, NOW, collect);

    expect(seen).toEqual([ACTIVE.id, NO_BOOKING.id, NO_LOYALTY.id]);
    expect(results).toEqual(seen);
  });

  it('includes suspended tenants when the scope says so, without reading the suspended list', async () => {
    await runner.forEachTenant({ label: LABEL, scope: 'includingSuspended' }, NOW, collect);

    expect(seen).toEqual([ACTIVE.id, SUSPENDED.id, NO_BOOKING.id, NO_LOYALTY.id]);
    expect(access.listSuspendedCalls).toBe(0);
  });

  it('skips a tenant that lacks the required feature', async () => {
    await runner.forEachTenant({ label: LABEL, requires: 'BOOKING' }, NOW, collect);

    expect(seen).toEqual([ACTIVE.id, NO_LOYALTY.id]);
  });

  it('skips a tenant missing any of several required features (all-of)', async () => {
    await runner.forEachTenant({ label: LABEL, requires: ['BOOKING', 'LOYALTY'] }, NOW, collect);

    expect(seen).toEqual([ACTIVE.id]);
    expect(access.notEntitledCalls).toEqual(['BOOKING', 'LOYALTY']);
  });

  it('is feature-agnostic: a job may require any feature', async () => {
    await runner.forEachTenant({ label: LABEL, requires: 'LOYALTY' }, NOW, collect);

    expect(seen).toEqual([ACTIVE.id, NO_BOOKING.id]);
  });

  describe('schedule policy (isDue)', () => {
    it('processes only the tenants that are due', async () => {
      const inWindow = {
        id: '00000000-0000-7000-8000-000000000010',
        timezone: 'America/Sao_Paulo',
      };
      directory.seed([inWindow]);

      await runner.forEachTenant(
        { label: LABEL, isDue: localTimeWindow({ start: '06:00', end: '06:29' }) },
        NOW,
        collect,
      );

      expect(seen).toEqual([inWindow.id]);
    });

    it('reads neither exclusion list when no tenant is due', async () => {
      await runner.forEachTenant(
        { label: LABEL, requires: 'BOOKING', isDue: () => false },
        NOW,
        collect,
      );

      expect(directory.listCalls).toBe(1);
      expect(access.listSuspendedCalls).toBe(0);
      expect(access.notEntitledCalls).toEqual([]);
      expect(seen).toEqual([]);
    });

    it('reads each exclusion list once per run, never once per tenant', async () => {
      await runner.forEachTenant({ label: LABEL, requires: 'BOOKING' }, NOW, collect);

      expect(access.listSuspendedCalls).toBe(1);
      expect(access.notEntitledCalls).toEqual(['BOOKING']);
      expect(access.getAccessCalls).toEqual([]);
    });
  });

  describe('failures', () => {
    it('tries every tenant after a failure, then fails the run naming each failed tenant', async () => {
      jest.spyOn(AppLogger.prototype, 'error').mockImplementation();

      await expect(
        runner.forEachTenant({ label: LABEL }, NOW, async (tenant) => {
          seen.push(tenant.id);
          if (tenant.id !== NO_BOOKING.id) throw new Error(`${tenant.id} broke`);
        }),
      ).rejects.toThrow(`${LABEL} failed for tenant(s): ${ACTIVE.id}, ${NO_LOYALTY.id}`);

      expect(seen).toEqual([ACTIVE.id, NO_BOOKING.id, NO_LOYALTY.id]);
    });

    it('logs each failed tenant at error level with its tenant id', async () => {
      const errorSpy = jest.spyOn(AppLogger.prototype, 'error').mockImplementation();

      await expect(
        runner.forEachTenant({ label: LABEL }, NOW, async () => {
          throw new Error('boom');
        }),
      ).rejects.toThrow();

      expect(errorSpy).toHaveBeenCalledWith(
        `${LABEL} failed for a tenant — the run will be retried`,
        expect.any(String),
        { tenantId: ACTIVE.id },
      );
    });

    it('resolves with no results when no tenant is due', async () => {
      await expect(
        runner.forEachTenant({ label: LABEL, isDue: () => false }, NOW, async () => {
          throw new Error('must not run');
        }),
      ).resolves.toEqual([]);
    });
  });

  describe('when the exclusion read fails', () => {
    it('logs at error level and processes every due tenant (fail-open)', async () => {
      const errorSpy = jest.spyOn(AppLogger.prototype, 'error').mockImplementation();
      access.batchReadError = new Error('billing read failed');

      await runner.forEachTenant({ label: LABEL, requires: 'BOOKING' }, NOW, collect);

      expect(seen).toEqual([ACTIVE.id, SUSPENDED.id, NO_BOOKING.id, NO_LOYALTY.id]);
      expect(errorSpy).toHaveBeenCalledWith(
        `${LABEL}: could not read tenant access, processing every due tenant`,
        expect.any(String),
      );
    });

    it('fails open when the feature-entitlement read is the one that throws', async () => {
      const errorSpy = jest.spyOn(AppLogger.prototype, 'error').mockImplementation();
      access.batchReadError = new Error('billing read failed');

      await runner.forEachTenant(
        { label: LABEL, scope: 'includingSuspended', requires: 'BOOKING' },
        NOW,
        collect,
      );

      expect(access.listSuspendedCalls).toBe(0);
      expect(access.notEntitledCalls).toEqual(['BOOKING']);
      expect(seen).toEqual([ACTIVE.id, SUSPENDED.id, NO_BOOKING.id, NO_LOYALTY.id]);
      expect(errorSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe('summary log', () => {
    it('is emitted once, with the skipped tenant ids, when something was skipped', async () => {
      const logSpy = jest.spyOn(AppLogger.prototype, 'log').mockImplementation();

      await runner.forEachTenant({ label: LABEL, requires: 'BOOKING' }, NOW, collect);

      expect(logSpy).toHaveBeenCalledTimes(1);
      expect(logSpy).toHaveBeenCalledWith(`${LABEL}: skipped suspended or unentitled tenants`, {
        suspendedTenantIds: [SUSPENDED.id],
        notEntitledTenantIds: { BOOKING: [NO_BOOKING.id] },
      });
    });

    it('is not emitted when nobody was skipped', async () => {
      const logSpy = jest.spyOn(AppLogger.prototype, 'log').mockImplementation();
      directory.clear();
      directory.seed([ACTIVE]);

      await runner.forEachTenant({ label: LABEL, requires: 'BOOKING' }, NOW, collect);

      expect(logSpy).not.toHaveBeenCalled();
    });

    it('does not count a suspended tenant that is not due this tick', async () => {
      const logSpy = jest.spyOn(AppLogger.prototype, 'log').mockImplementation();

      await runner.forEachTenant(
        { label: LABEL, isDue: (tenant) => tenant.id === ACTIVE.id },
        NOW,
        collect,
      );

      expect(logSpy).not.toHaveBeenCalled();
    });
  });

  it('opens no transaction around the work', async () => {
    let activeManager: unknown = 'unset';

    await runner.forEachTenant({ label: LABEL }, NOW, async () => {
      activeManager = getActiveEntityManager();
    });

    expect(activeManager).toBeUndefined();
  });
});
