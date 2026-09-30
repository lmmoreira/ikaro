import { describe, expect, it } from 'vitest';
import { isValidRecurringHorizonDays } from './recurring-horizon';

describe('isValidRecurringHorizonDays', () => {
  it.each([null, 1, 90, 180])('accepts %j', (value) => {
    expect(isValidRecurringHorizonDays(value)).toBe(true);
  });

  it.each([0, -1, 181, 365, 1.5])('rejects %j', (value) => {
    expect(isValidRecurringHorizonDays(value)).toBe(false);
  });
});
