import { AsyncLocalStorage } from 'node:async_hooks';
import { EntityManager } from 'typeorm';

// Carries the active transactional EntityManager across await boundaries.
// Populated by TypeOrmTransactionManager.run(); read by transaction-aware repositories.
export type TransactionContext = {
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
