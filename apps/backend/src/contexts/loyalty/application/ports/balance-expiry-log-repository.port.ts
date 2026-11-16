export const BALANCE_EXPIRY_LOG_REPOSITORY = Symbol('BALANCE_EXPIRY_LOG_REPOSITORY');

export interface IBalanceExpiryLogRepository {
  // Which of the given entries are already marked processed. Reads on the active transaction when
  // there is one, so a caller holding the balance row lock sees what another run committed.
  findProcessedEntryIds(entryIds: string[]): Promise<Set<string>>;
  // One multi-row insert that never overwrites an existing row, so a caller holding the balance
  // row lock writes every mark of a customer in a single round trip.
  markProcessedMany(entryIds: string[]): Promise<void>;
}
