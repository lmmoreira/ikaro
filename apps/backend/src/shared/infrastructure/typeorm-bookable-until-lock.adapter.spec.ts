import { EntityManager } from 'typeorm';
import { runWithEntityManager } from './transaction-context';
import { TypeOrmBookableUntilLockAdapter } from './typeorm-bookable-until-lock.adapter';

describe('TypeOrmBookableUntilLockAdapter', () => {
  let adapter: TypeOrmBookableUntilLockAdapter;
  let manager: EntityManager;

  beforeEach(() => {
    adapter = new TypeOrmBookableUntilLockAdapter();
    // The adapter calls exactly one EntityManager method, `query`; EntityManager is a TypeORM class
    // with no narrower public type and `runWithEntityManager` takes the class, so a stub of that
    // one method is cast once here, the same boundary every TypeORM adapter spec in this repo
    // stubs (typeorm-tenant-lock.adapter.spec.ts). The real behavior is proven against Postgres by
    // bookable-until-lock.integration.spec.ts.
    manager = { query: jest.fn().mockResolvedValue(undefined) } as unknown as EntityManager;
  });

  it('takes the SHARED advisory transaction lock on a namespaced per-tenant key', async () => {
    await runWithEntityManager(manager, () => adapter.lockCommitmentsShared('tenant-1'));

    expect(manager.query).toHaveBeenCalledTimes(1);
    expect(manager.query).toHaveBeenCalledWith(
      'SELECT pg_advisory_xact_lock_shared(hashtextextended($1::text, 0::bigint))',
      ['bookable-until:tenant-1'],
    );
  });

  it('takes the EXCLUSIVE advisory transaction lock on the same key', async () => {
    await runWithEntityManager(manager, () => adapter.lockCommitmentsExclusive('tenant-1'));

    expect(manager.query).toHaveBeenCalledWith(
      'SELECT pg_advisory_xact_lock(hashtextextended($1::text, 0::bigint))',
      ['bookable-until:tenant-1'],
    );
  });

  it('keys by tenant, so one tenant never orders another', async () => {
    await runWithEntityManager(manager, async () => {
      await adapter.lockCommitmentsShared('tenant-1');
      await adapter.lockCommitmentsShared('tenant-2');
    });

    expect(manager.query).toHaveBeenNthCalledWith(1, expect.any(String), [
      'bookable-until:tenant-1',
    ]);
    expect(manager.query).toHaveBeenNthCalledWith(2, expect.any(String), [
      'bookable-until:tenant-2',
    ]);
  });

  it.each([
    ['shared', (tenantId: string) => adapter.lockCommitmentsShared(tenantId)],
    ['exclusive', (tenantId: string) => adapter.lockCommitmentsExclusive(tenantId)],
  ])('throws outside a transaction in %s mode', async (_mode, take) => {
    await expect(take('tenant-1')).rejects.toThrow(
      'Bookable-until lock requires an active transaction',
    );
  });
});
