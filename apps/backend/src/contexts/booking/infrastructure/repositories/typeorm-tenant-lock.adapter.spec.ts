import { EntityManager } from 'typeorm';
import { runWithEntityManager } from '../../../../shared/infrastructure/transaction-context';
import { TypeOrmTenantLockAdapter } from './typeorm-tenant-lock.adapter';

describe('TypeOrmTenantLockAdapter', () => {
  let adapter: TypeOrmTenantLockAdapter;

  beforeEach(() => {
    adapter = new TypeOrmTenantLockAdapter();
  });

  it('uses a 64-bit advisory transaction lock per tenant/day (key format unchanged for deploy-rollout compatibility)', async () => {
    const manager = { query: jest.fn().mockResolvedValue(undefined) } as unknown as EntityManager;

    await runWithEntityManager(manager, () => adapter.lockTenantDay('tenant-1', '2026-06-01'));

    expect(manager.query).toHaveBeenCalledWith(
      `SELECT pg_advisory_xact_lock(
         hashtextextended($1::text, 0::bigint)
       )`,
      ['tenant-1:2026-06-01'],
    );
  });

  it('throws when lockTenantDay is called outside a transaction', async () => {
    await expect(adapter.lockTenantDay('tenant-1', '2026-06-01')).rejects.toThrow(
      'Tenant lock requires an active transaction',
    );
  });

  it('uses a 64-bit advisory transaction lock per tenant/staff, namespaced', async () => {
    const manager = { query: jest.fn().mockResolvedValue(undefined) } as unknown as EntityManager;

    await runWithEntityManager(manager, () => adapter.lockTenantStaff('tenant-1', 'staff-1'));

    expect(manager.query).toHaveBeenCalledWith(
      `SELECT pg_advisory_xact_lock(
         hashtextextended($1::text, 0::bigint)
       )`,
      ['tenantstaff:tenant-1:staff-1'],
    );
  });

  it('throws when lockTenantStaff is called outside a transaction', async () => {
    await expect(adapter.lockTenantStaff('tenant-1', 'staff-1')).rejects.toThrow(
      'Tenant lock requires an active transaction',
    );
  });

  it('acquires one namespaced advisory lock per deduplicated resource id, sorted ascending', async () => {
    const manager = { query: jest.fn().mockResolvedValue(undefined) } as unknown as EntityManager;

    await runWithEntityManager(manager, () =>
      adapter.lockResources('tenant-1', ['res-b', 'res-a', 'res-b']),
    );

    expect(manager.query).toHaveBeenCalledTimes(2);
    expect(manager.query).toHaveBeenNthCalledWith(
      1,
      `SELECT pg_advisory_xact_lock(
         hashtextextended($1::text, 0::bigint)
       )`,
      ['resource:tenant-1:res-a'],
    );
    expect(manager.query).toHaveBeenNthCalledWith(
      2,
      `SELECT pg_advisory_xact_lock(
         hashtextextended($1::text, 0::bigint)
       )`,
      ['resource:tenant-1:res-b'],
    );
  });

  it('is a no-op when lockResources is called with an empty resourceIds array', async () => {
    const manager = { query: jest.fn().mockResolvedValue(undefined) } as unknown as EntityManager;

    await runWithEntityManager(manager, () => adapter.lockResources('tenant-1', []));

    expect(manager.query).not.toHaveBeenCalled();
  });

  it('throws when lockResources is called outside a transaction', async () => {
    await expect(adapter.lockResources('tenant-1', ['res-a'])).rejects.toThrow(
      'Tenant lock requires an active transaction',
    );
  });

  it('uses a 64-bit advisory transaction lock per tenant/service, namespaced', async () => {
    const manager = { query: jest.fn().mockResolvedValue(undefined) } as unknown as EntityManager;

    await runWithEntityManager(manager, () => adapter.lockService('tenant-1', 'service-1'));

    expect(manager.query).toHaveBeenCalledWith(
      `SELECT pg_advisory_xact_lock(
         hashtextextended($1::text, 0::bigint)
       )`,
      ['service:tenant-1:service-1'],
    );
  });

  it('throws when lockService is called outside a transaction', async () => {
    await expect(adapter.lockService('tenant-1', 'service-1')).rejects.toThrow(
      'Tenant lock requires an active transaction',
    );
  });

  it('uses a 64-bit advisory transaction lock per tenant/customer for availability alerts, namespaced', async () => {
    const manager = { query: jest.fn().mockResolvedValue(undefined) } as unknown as EntityManager;

    await runWithEntityManager(manager, () => adapter.lockCustomerAlerts('tenant-1', 'customer-1'));

    expect(manager.query).toHaveBeenCalledWith(
      `SELECT pg_advisory_xact_lock(
         hashtextextended($1::text, 0::bigint)
       )`,
      ['availability-alerts:tenant-1:customer-1'],
    );
  });

  it('throws when lockCustomerAlerts is called outside a transaction', async () => {
    await expect(adapter.lockCustomerAlerts('tenant-1', 'customer-1')).rejects.toThrow(
      'Tenant lock requires an active transaction',
    );
  });
});
