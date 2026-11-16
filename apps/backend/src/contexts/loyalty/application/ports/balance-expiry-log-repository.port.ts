export const BALANCE_EXPIRY_LOG_REPOSITORY = Symbol('BALANCE_EXPIRY_LOG_REPOSITORY');

export interface IBalanceExpiryLogRepository {
  hasBeenProcessed(entryId: string): Promise<boolean>;
  // Which of the given entries are already marked processed. Reads on the active transaction when
  // there is one, so a caller holding the balance row lock sees what another run committed.
  findProcessedEntryIds(entryIds: string[]): Promise<Set<string>>;
  markProcessed(entryId: string): Promise<void>;
}
