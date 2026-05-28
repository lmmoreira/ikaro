export const BALANCE_EXPIRY_LOG_REPOSITORY = Symbol('BALANCE_EXPIRY_LOG_REPOSITORY');

export interface IBalanceExpiryLogRepository {
  hasBeenProcessed(entryId: string): Promise<boolean>;
  markProcessed(entryId: string): Promise<void>;
}
