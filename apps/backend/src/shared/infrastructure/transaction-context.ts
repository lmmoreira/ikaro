import { AsyncLocalStorage } from 'node:async_hooks';
import { EntityManager } from 'typeorm';

// Carries the active transactional EntityManager across await boundaries.
// Populated by TypeOrmTransactionManager.run(); read by transaction-aware repositories.
type TransactionContext = {
  entityManager: EntityManager;
  afterCommitCallbacks: Array<() => Promise<void> | void>;
};

const storage = new AsyncLocalStorage<TransactionContext>();

export function createTransactionContext(entityManager: EntityManager): TransactionContext {
  return {
    entityManager,
    afterCommitCallbacks: [],
  };
}

export function runWithEntityManager<T>(
  manager: EntityManager,
  work: () => Promise<T>,
): Promise<T> {
  return storage.run(createTransactionContext(manager), work);
}

export function runWithTransactionContext<T>(
  context: TransactionContext,
  work: () => Promise<T>,
): Promise<T> {
  return storage.run(context, work);
}

export function getActiveEntityManager(): EntityManager | undefined {
  return storage.getStore()?.entityManager;
}

export function scheduleAfterCommit(callback: () => Promise<void> | void): Promise<void> {
  const context = storage.getStore();

  if (!context) {
    return Promise.resolve(callback());
  }

  context.afterCommitCallbacks.push(callback);
  return Promise.resolve();
}

export async function flushAfterCommitCallbacks(context: TransactionContext): Promise<void> {
  const callbacks = context.afterCommitCallbacks.splice(0);

  for (const callback of callbacks) {
    await callback();
  }
}

// A DataSource or an EntityManager both expose this shape for opening a new transaction.
interface TransactionRoot {
  transaction<T>(runInTransaction: (entityManager: EntityManager) => Promise<T>): Promise<T>;
}

// Shared by TypeOrmTransactionManager.run() (the ambient entry point) and any repository's
// self-managed-transaction fallback (no ambient tx from the caller) — both need the exact same
// sequence: open a transaction, register it as the ambient context for the work's duration, then
// flush after-commit callbacks (e.g. the outbox's inline dispatch) once the transaction has
// actually committed. Keeping one copy of this sequence avoids the two call sites drifting apart.
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
