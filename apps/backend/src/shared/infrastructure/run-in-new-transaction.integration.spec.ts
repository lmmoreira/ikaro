import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { uuidv7 } from '../domain/uuid-v7';
import { ITransactionManager, TRANSACTION_MANAGER } from '../ports/transaction-manager.port';
import {
  IServiceRepository,
  SERVICE_REPOSITORY,
} from '../../contexts/booking/application/ports/service-repository.port';
import {
  ITenantLockPort,
  TENANT_LOCK_PORT,
} from '../../contexts/booking/application/ports/tenant-lock.port';
import { createBookingIntegrationApp } from '../../test/utils/booking-integration-app';
import {
  createLockRaceWorld,
  holdResourceLocks,
  holdTransaction,
  LockRaceEnv,
} from '../../test/utils/booking-lock-race-world';
import { DB_LOCK_TIMEOUT_MS, runInNewTransaction } from './run-in-new-transaction';
import { getActiveEntityManager } from './transaction-context';
import {
  DEADLOCK_DETECTED_SQLSTATE,
  LOCK_NOT_AVAILABLE_SQLSTATE,
  TransactionContentionError,
} from './transaction-contention.error';

// M23-S49 — the choke point against a real Postgres: a transaction that waits longer than
// DB_LOCK_TIMEOUT_MS for a lock fails fast with a TransactionContentionError instead of hanging,
// a deadlock victim fails with the same type, and the lock holder is never affected. Each scenario
// builds its own tenant, so nothing is shared between them (docs/TESTING_STRATEGY.md §
// Concurrency tests). Mutation check (docs/LOCK_CATALOG.md § 7 step 8): removing the
// set_config call in runInNewTransaction makes the two "waits" tests hang until Jest's own timeout.
describe('runInNewTransaction — lock contention (integration)', () => {
  let app: INestApplication;
  let ds: DataSource;
  let env: LockRaceEnv;
  let txManager: ITransactionManager;
  let tenantLock: ITenantLockPort;
  let serviceRepo: IServiceRepository;

  // The waiter fails within the timeout plus a margin for the round trips and Postgres' own
  // lock-wait wakeup granularity.
  const WITHIN_TIMEOUT_MS = DB_LOCK_TIMEOUT_MS + 1500;

  beforeAll(async () => {
    ({ app, ds } = await createBookingIntegrationApp());
    txManager = app.get(TRANSACTION_MANAGER);
    tenantLock = app.get(TENANT_LOCK_PORT);
    serviceRepo = app.get(SERVICE_REPOSITORY);
    env = {
      ds,
      txManager,
      tenantLock,
      occupancyRepo: undefined as never,
    };
  });

  afterAll(async () => {
    await app.close();
  });

  async function elapsedUntilRejected(
    work: () => Promise<unknown>,
  ): Promise<{ error: unknown; elapsedMs: number }> {
    const startedAt = Date.now();
    const error = await work().then(
      () => undefined,
      (e: unknown) => e,
    );
    return { error, elapsedMs: Date.now() - startedAt };
  }

  it('an advisory lock held longer than the timeout makes the waiter fail fast; the holder commits', async () => {
    const tenantId = uuidv7();
    const resourceId = uuidv7();
    const holder = await holdResourceLocks(env, tenantId, [resourceId]);

    // The holder is released even when an assertion fails, so a failed run never leaves its
    // lock held for the next scenario.
    try {
      const { error, elapsedMs } = await elapsedUntilRejected(() =>
        txManager.run(() => tenantLock.lockResources(tenantId, [resourceId])),
      );

      expect(error).toBeInstanceOf(TransactionContentionError);
      expect((error as TransactionContentionError).sqlState).toBe(LOCK_NOT_AVAILABLE_SQLSTATE);
      expect(elapsedMs).toBeGreaterThanOrEqual(DB_LOCK_TIMEOUT_MS - 200);
      expect(elapsedMs).toBeLessThan(WITHIN_TIMEOUT_MS);
    } finally {
      await holder.release();
    }
  });

  it('a row lock (service FOR UPDATE) held longer than the timeout makes the waiter fail fast; the holder commits', async () => {
    const world = await createLockRaceWorld(env);
    const holder = await holdTransaction(env, () =>
      serviceRepo.findByIdForUpdate(world.serviceId, world.tenantId),
    );

    // The holder is released even when an assertion fails, so a failed run never leaves its
    // lock held for the next scenario.
    try {
      const { error, elapsedMs } = await elapsedUntilRejected(() =>
        txManager.run(() => serviceRepo.findByIdForUpdate(world.serviceId, world.tenantId)),
      );

      expect(error).toBeInstanceOf(TransactionContentionError);
      expect((error as TransactionContentionError).sqlState).toBe(LOCK_NOT_AVAILABLE_SQLSTATE);
      expect(elapsedMs).toBeLessThan(WITHIN_TIMEOUT_MS);
    } finally {
      await holder.release();
    }
  });

  it('two transactions taking two advisory keys in opposite orders: exactly one is a deadlock victim, the other commits', async () => {
    const keyA = `s49-deadlock-a:${uuidv7()}`;
    const keyB = `s49-deadlock-b:${uuidv7()}`;
    const lock = (key: string) =>
      getActiveEntityManager()!.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [
        key,
      ]);

    let bothHoldTheirFirstKey!: () => void;
    const firstKeysHeld = new Promise<void>((resolve) => (bothHoldTheirFirstKey = resolve));
    let arrived = 0;
    const takeFirstKeyThenSecond = (first: string, second: string) =>
      txManager.run(async () => {
        await lock(first);
        if (++arrived === 2) bothHoldTheirFirstKey();
        await firstKeysHeld;
        await lock(second);
        return 'committed';
      });

    const outcomes = await Promise.allSettled([
      takeFirstKeyThenSecond(keyA, keyB),
      takeFirstKeyThenSecond(keyB, keyA),
    ]);

    const committed = outcomes.filter((o) => o.status === 'fulfilled');
    const failed = outcomes.filter((o): o is PromiseRejectedResult => o.status === 'rejected');
    expect(committed).toHaveLength(1);
    expect(failed).toHaveLength(1);
    expect(failed[0].reason).toBeInstanceOf(TransactionContentionError);
    expect((failed[0].reason as TransactionContentionError).sqlState).toBe(
      DEADLOCK_DETECTED_SQLSTATE,
    );
  });

  it('the timeout does not leak: after a commit, the next transaction on the same pooled connection reads the server default', async () => {
    const singleConnection = new DataSource({
      ...(ds.options as object),
      extra: { max: 1 },
    } as ConstructorParameters<typeof DataSource>[0]);
    await singleConnection.initialize();
    try {
      const serverDefault = await showLockTimeout(singleConnection);
      const insideTransaction = await runInNewTransaction(singleConnection, (manager) =>
        showLockTimeout(manager),
      );
      const afterCommit = await showLockTimeout(singleConnection);

      expect(insideTransaction).toBe('2s');
      expect(afterCommit).toBe(serverDefault);
      expect(afterCommit).not.toBe(insideTransaction);
    } finally {
      await singleConnection.destroy();
    }
  });

  it('a unique violation inside the transaction still surfaces unchanged (negative guarantee: not mapped to contention)', async () => {
    const table = `s49_unique_${Date.now()}`;
    await ds.query(`CREATE TABLE ${table} (id int PRIMARY KEY)`);
    try {
      await ds.query(`INSERT INTO ${table} VALUES (1)`);

      const error = await txManager
        .run(async () => {
          await getActiveEntityManager()!.query(`INSERT INTO ${table} VALUES (1)`);
        })
        .catch((e: unknown) => e);

      expect(error).not.toBeInstanceOf(TransactionContentionError);
      expect((error as { driverError?: { code?: string } }).driverError?.code).toBe('23505');
    } finally {
      await ds.query(`DROP TABLE ${table}`);
    }
  });
});

async function showLockTimeout(root: {
  query(sql: string): Promise<{ lock_timeout: string }[]>;
}): Promise<string> {
  const [{ lock_timeout }] = await root.query('SHOW lock_timeout');
  return lock_timeout;
}
