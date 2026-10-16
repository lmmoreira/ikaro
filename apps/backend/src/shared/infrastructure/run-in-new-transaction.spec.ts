import { EntityManager, QueryFailedError } from 'typeorm';
import { DB_LOCK_TIMEOUT_MS, runInNewTransaction } from './run-in-new-transaction';
import {
  DEADLOCK_DETECTED_SQLSTATE,
  LOCK_NOT_AVAILABLE_SQLSTATE,
  TransactionContentionError,
} from './transaction-contention.error';

function makeManager(calls: string[] = []) {
  const query = jest.fn(async (sql: string) => {
    calls.push(`query:${sql}`);
    return [];
  });
  return { manager: { query } as unknown as EntityManager, query };
}

function makeRoot(manager: EntityManager) {
  return {
    transaction: async <T>(fn: (em: EntityManager) => Promise<T>): Promise<T> => fn(manager),
  };
}

function queryFailed(code: string, message = 'driver message'): QueryFailedError {
  return new QueryFailedError('SELECT 1', [], Object.assign(new Error(message), { code }));
}

describe('runInNewTransaction', () => {
  it('sets the transaction-local lock_timeout first, before the work, once per transaction', async () => {
    const calls: string[] = [];
    const { manager, query } = makeManager(calls);

    await runInNewTransaction(makeRoot(manager), async () => {
      calls.push('work');
    });

    expect(calls).toEqual(["query:SELECT set_config('lock_timeout', $1, true)", 'work']);
    expect(query).toHaveBeenCalledTimes(1);
    expect(query).toHaveBeenCalledWith("SELECT set_config('lock_timeout', $1, true)", [
      `${DB_LOCK_TIMEOUT_MS}ms`,
    ]);
  });

  it('uses a 2s lock timeout, short enough for two waits to fit inside the web 8s budget', () => {
    expect(DB_LOCK_TIMEOUT_MS).toBe(2000);
  });

  it('returns the value produced by the work', async () => {
    const { manager } = makeManager();

    await expect(runInNewTransaction(makeRoot(manager), async () => 42)).resolves.toBe(42);
  });

  it.each([
    ['lock timeout', LOCK_NOT_AVAILABLE_SQLSTATE],
    ['deadlock abort', DEADLOCK_DETECTED_SQLSTATE],
  ] as const)(
    'turns a %s (%s) raised by the work into a TransactionContentionError carrying the original as cause',
    async (_label, sqlState) => {
      const { manager } = makeManager();
      const original = queryFailed(sqlState);

      const error = await runInNewTransaction(makeRoot(manager), async () => {
        throw original;
      }).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(TransactionContentionError);
      expect((error as TransactionContentionError).sqlState).toBe(sqlState);
      expect((error as TransactionContentionError).cause).toBe(original);
    },
  );

  it('turns a contention error raised while setting the timeout itself into a TransactionContentionError', async () => {
    const query = jest.fn().mockRejectedValue(queryFailed(DEADLOCK_DETECTED_SQLSTATE));
    const root = makeRoot({ query } as unknown as EntityManager);

    await expect(runInNewTransaction(root, async () => 1)).rejects.toBeInstanceOf(
      TransactionContentionError,
    );
  });

  it('passes any other QueryFailedError through unchanged (negative guarantee: a unique violation stays a unique violation)', async () => {
    const { manager } = makeManager();
    const uniqueViolation = queryFailed('23505');

    const error = await runInNewTransaction(makeRoot(manager), async () => {
      throw uniqueViolation;
    }).catch((e: unknown) => e);

    expect(error).toBe(uniqueViolation);
  });

  it('passes a non-database error through unchanged', async () => {
    const { manager } = makeManager();
    const boom = new Error('boom');

    await expect(
      runInNewTransaction(makeRoot(manager), async () => {
        throw boom;
      }),
    ).rejects.toBe(boom);
  });

  it('does not run after-commit callbacks when the transaction is aborted by contention', async () => {
    const { manager } = makeManager();
    const afterCommit = jest.fn();
    const { scheduleAfterCommit } = await import('./transaction-context');

    await expect(
      runInNewTransaction(makeRoot(manager), async () => {
        await scheduleAfterCommit(afterCommit);
        throw queryFailed(LOCK_NOT_AVAILABLE_SQLSTATE);
      }),
    ).rejects.toBeInstanceOf(TransactionContentionError);

    expect(afterCommit).not.toHaveBeenCalled();
  });
});
