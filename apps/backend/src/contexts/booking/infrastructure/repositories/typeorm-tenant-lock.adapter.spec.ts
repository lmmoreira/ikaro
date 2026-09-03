import { EntityManager } from 'typeorm';
import { runWithEntityManager } from '../../../../shared/infrastructure/transaction-context';
import { TypeOrmTenantLockAdapter } from './typeorm-tenant-lock.adapter';

describe('TypeOrmTenantLockAdapter', () => {
  let adapter: TypeOrmTenantLockAdapter;

  beforeEach(() => {
    adapter = new TypeOrmTenantLockAdapter();
  });

  it('uses a 64-bit advisory transaction lock per tenant/day', async () => {
    const manager = { query: jest.fn().mockResolvedValue(undefined) } as unknown as EntityManager;

    await runWithEntityManager(manager, () => adapter.lockTenantDay('tenant-1', '2026-06-01'));

    expect(manager.query).toHaveBeenCalledWith(
      `SELECT pg_advisory_xact_lock(
         hashtextextended($1::text, 0::bigint)
       )`,
      ['tenant-1:2026-06-01'],
    );
  });

  it('throws when called outside a transaction', async () => {
    await expect(adapter.lockTenantDay('tenant-1', '2026-06-01')).rejects.toThrow(
      'Tenant lock requires an active transaction',
    );
  });
});
