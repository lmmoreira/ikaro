// Postgres SQLSTATEs that mean "this transaction lost a contention fight and wrote nothing":
// 55P03 lock_not_available (the transaction-local lock_timeout fired while waiting for a lock),
// 40P01 deadlock_detected (Postgres aborted this side to break a lock cycle).
export const LOCK_NOT_AVAILABLE_SQLSTATE = '55P03';
export const DEADLOCK_DETECTED_SQLSTATE = '40P01';

export type TransactionContentionSqlState =
  typeof LOCK_NOT_AVAILABLE_SQLSTATE | typeof DEADLOCK_DETECTED_SQLSTATE;

// Infrastructure error, not a domain one (no business meaning, no mapXxxError branch): both
// failures mean the same thing to a caller — nothing was written, try again — so they share one
// type. Thrown by runInNewTransaction; the backend ErrorFilter renders it as a retryable 503.
// The original driver error is kept as `cause` for debugging; its SQL text and lock key must
// never reach a response (the filter builds the body from a fixed message, not from this error).
export class TransactionContentionError extends Error {
  constructor(
    readonly sqlState: TransactionContentionSqlState,
    cause: unknown,
  ) {
    super(`Transaction aborted by lock contention (SQLSTATE ${sqlState})`, { cause });
    this.name = 'TransactionContentionError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
