import { EntityManager, QueryFailedError } from 'typeorm';
import { AppLogger } from '../observability/app-logger';
import {
  createTransactionContext,
  flushAfterCommitCallbacks,
  runWithTransactionContext,
  TransactionContext,
} from './transaction-context';
import {
  DEADLOCK_DETECTED_SQLSTATE,
  LOCK_NOT_AVAILABLE_SQLSTATE,
  TransactionContentionError,
  TransactionContentionSqlState,
} from './transaction-contention.error';

// A DataSource or an EntityManager both expose this shape for opening a new transaction.
interface TransactionRoot {
  transaction<T>(runInTransaction: (entityManager: EntityManager) => Promise<T>): Promise<T>;
}

// How long one statement of a transaction may wait for a lock before Postgres aborts it (SQLSTATE
// 55P03). It bounds EACH lock wait, not the whole transaction, which can wait on several locks in
// turn. Normal lock holds last milliseconds, so this only fires when a holder is slow or stuck.
// 2s, not more: the web gives up on a BFF call after 8s (DEFAULT_BFF_TIMEOUT_MS in
// apps/web/shared/lib/api/bff-server.ts) and the BFF gives up on the backend after 10s, so two
// waits must fit inside the web's budget or the caller sees a timeout instead of the retryable
// 503. A constant, not an env var: no known reason for it to differ per environment
// (docs/28-LOCK_CATALOG.md, hazard H5).
export const DB_LOCK_TIMEOUT_MS = 2000;

const logger = new AppLogger('runInNewTransaction');

// Shared by TypeOrmTransactionManager.run() (the ambient entry point) and any repository's
// self-managed-transaction fallback (no ambient tx from the caller) — both need the exact same
// sequence: open a transaction, register it as the ambient context for the work's duration, then
// flush after-commit callbacks (e.g. the outbox's inline dispatch) once the transaction has
// actually committed. Keeping one copy of this sequence avoids the two call sites drifting apart.
// Deliberately its own file, not transaction-context.ts: that module only manages the ambient
// AsyncLocalStorage state given an already-open EntityManager — it has no notion of opening a
// transaction. This function is the layer above it that actually calls root.transaction().
//
// It is also the one choke point for lock contention (M23-S49): every transaction sets a
// transaction-local lock_timeout first, and a lock timeout or a deadlock abort leaves here as one
// typed TransactionContentionError. Every other error passes through untouched.
export async function runInNewTransaction<T>(
  root: TransactionRoot,
  work: (manager: EntityManager) => Promise<T>,
): Promise<T> {
  let context: TransactionContext | undefined;
  let result: T;

  try {
    result = await root.transaction(async (entityManager) => {
      // set_config(..., is_local = true), not SET LOCAL (which cannot take a parameter) and never a
      // session setting: it ends with this transaction, so it cannot leak to the next user of a
      // pooled connection.
      await entityManager.query("SELECT set_config('lock_timeout', $1, true)", [
        `${DB_LOCK_TIMEOUT_MS}ms`,
      ]);
      context = createTransactionContext(entityManager);
      return runWithTransactionContext(context, () => work(entityManager));
    });
  } catch (error) {
    const sqlState = contentionSqlState(error);
    if (!sqlState) throw error;
    logger.warn('Transaction aborted by lock contention', { sqlState });
    throw new TransactionContentionError(sqlState, error);
  }

  if (context) {
    await flushAfterCommitCallbacks(context);
  }

  return result;
}

function contentionSqlState(error: unknown): TransactionContentionSqlState | undefined {
  if (!(error instanceof QueryFailedError)) return undefined;
  const code = (error.driverError as { code?: unknown } | undefined)?.code;
  if (code === LOCK_NOT_AVAILABLE_SQLSTATE || code === DEADLOCK_DETECTED_SQLSTATE) return code;
  return undefined;
}
