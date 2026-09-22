import { ITransactionManager } from '../../shared/ports/transaction-manager.port';

// No real transaction is needed for in-memory repos — just run the work directly.
// Actual rollback behaviour is covered by integration tests against a real DB.
export class InMemoryTransactionManager implements ITransactionManager {
  private readonly afterCommitCallbacks: Array<() => Promise<void> | void> = [];
  private inTransaction = false;
  // Counts every run() invocation — state-based replacement for a jest.fn() call-count assertion.
  runCallCount = 0;

  get isInTransaction(): boolean {
    return this.inTransaction;
  }

  async run<T>(work: () => Promise<T>): Promise<T> {
    this.runCallCount++;
    this.inTransaction = true;
    try {
      const result = await work();
      const callbacks = this.afterCommitCallbacks.splice(0);
      for (const callback of callbacks) await callback();
      return result;
    } finally {
      this.inTransaction = false;
      this.afterCommitCallbacks.splice(0);
    }
  }

  async scheduleAfterCommit(callback: () => Promise<void> | void): Promise<void> {
    if (!this.inTransaction) {
      await callback();
      return;
    }
    this.afterCommitCallbacks.push(callback);
  }
}
