export const TRANSACTION_MANAGER = Symbol('ITransactionManager');

export interface ITransactionManager {
  run<T>(work: () => Promise<T>): Promise<T>;
  scheduleAfterCommit(callback: () => Promise<void> | void): Promise<void>;
}
