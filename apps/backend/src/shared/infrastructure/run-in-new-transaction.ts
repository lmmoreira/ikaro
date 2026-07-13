import { EntityManager } from 'typeorm';
import {
  createTransactionContext,
  flushAfterCommitCallbacks,
  runWithTransactionContext,
  TransactionContext,
} from './transaction-context';

// A DataSource or an EntityManager both expose this shape for opening a new transaction.
interface TransactionRoot {
  transaction<T>(runInTransaction: (entityManager: EntityManager) => Promise<T>): Promise<T>;
}

// Shared by TypeOrmTransactionManager.run() (the ambient entry point) and any repository's
// self-managed-transaction fallback (no ambient tx from the caller) — both need the exact same
// sequence: open a transaction, register it as the ambient context for the work's duration, then
// flush after-commit callbacks (e.g. the outbox's inline dispatch) once the transaction has
// actually committed. Keeping one copy of this sequence avoids the two call sites drifting apart.
// Deliberately its own file, not transaction-context.ts: that module only manages the ambient
// AsyncLocalStorage state given an already-open EntityManager — it has no notion of opening a
// transaction. This function is the layer above it that actually calls root.transaction().
export async function runInNewTransaction<T>(
  root: TransactionRoot,
  work: (manager: EntityManager) => Promise<T>,
): Promise<T> {
  let context: TransactionContext | undefined;

  const result = await root.transaction(async (entityManager) => {
    context = createTransactionContext(entityManager);
    return runWithTransactionContext(context, () => work(entityManager));
  });

  if (context) {
    await flushAfterCommitCallbacks(context);
  }

  return result;
}
