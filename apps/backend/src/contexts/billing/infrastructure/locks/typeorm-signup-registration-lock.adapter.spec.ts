import { EntityManager } from 'typeorm';
import { runWithEntityManager } from '../../../../shared/infrastructure/transaction-context';
import { TypeOrmSignupRegistrationLockAdapter } from './typeorm-signup-registration-lock.adapter';

describe('TypeOrmSignupRegistrationLockAdapter', () => {
  let adapter: TypeOrmSignupRegistrationLockAdapter;

  beforeEach(() => {
    adapter = new TypeOrmSignupRegistrationLockAdapter();
  });

  // The key format is pinned: once it has protected production traffic it cannot change, because a
  // rolling deploy runs old and new code side by side (docs/LOCK_CATALOG.md, B-A1).
  it('takes a 64-bit advisory transaction lock on the namespaced key signup:{googleSub}', async () => {
    const manager = { query: jest.fn().mockResolvedValue(undefined) } as unknown as EntityManager;

    await runWithEntityManager(manager, () => adapter.lockSignupRegistration('google-sub-1'));

    expect(manager.query).toHaveBeenCalledWith(
      `SELECT pg_advisory_xact_lock(
         hashtextextended($1::text, 0::bigint)
       )`,
      ['signup:google-sub-1'],
    );
  });

  it('throws when called outside a transaction', async () => {
    await expect(adapter.lockSignupRegistration('google-sub-1')).rejects.toThrow(
      'Signup registration lock requires an active transaction',
    );
  });
});
