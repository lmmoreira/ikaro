import {
  DEADLOCK_DETECTED_SQLSTATE,
  LOCK_NOT_AVAILABLE_SQLSTATE,
  TransactionContentionError,
} from './transaction-contention.error';

describe('TransactionContentionError', () => {
  it.each([LOCK_NOT_AVAILABLE_SQLSTATE, DEADLOCK_DETECTED_SQLSTATE] as const)(
    'carries SQLSTATE %s and the original error as cause',
    (sqlState) => {
      const original = new Error('driver says: relation "x" row lock key 123');

      const error = new TransactionContentionError(sqlState, original);

      expect(error.sqlState).toBe(sqlState);
      expect(error.cause).toBe(original);
      expect(error.name).toBe('TransactionContentionError');
      expect(error).toBeInstanceOf(TransactionContentionError);
      expect(error).toBeInstanceOf(Error);
    },
  );

  it('does not copy the driver message into its own message', () => {
    const error = new TransactionContentionError(
      LOCK_NOT_AVAILABLE_SQLSTATE,
      new Error('SELECT secret FROM tenant_b'),
    );

    expect(error.message).not.toContain('tenant_b');
  });
});
