import { GenericErrorCode, deriveViolation } from '@ikaro/types';
import { AdvanceClockSchema } from './advance-clock.dto';

function violationsOf(input: unknown) {
  const result = AdvanceClockSchema.safeParse(input, { reportInput: true });
  return result.success ? null : result.error.issues.map(deriveViolation);
}

describe('AdvanceClockSchema', () => {
  it.each([{ days: 1 }, { hours: 2 }, { days: 1, hours: 2 }, { days: 36_500 }, { hours: 876_000 }])(
    'accepts %j',
    (input) => {
      expect(violationsOf(input)).toBeNull();
    },
  );

  // A negative guarantee ("rejected on save"): nothing else catches a regression here.
  it.each([
    ['negative days', { days: -1 }],
    ['negative hours', { hours: -3 }],
    ['fractional days', { days: 1.5 }],
    ['fractional hours', { hours: 0.5 }],
    ['days past the cap', { days: 36_501 }],
    ['hours past the cap', { hours: 876_001 }],
    ['a huge value that would make Date invalid', { days: 1_000_000_000_000 }],
    ['a value that overflows to Infinity', { days: 1e308 }],
    ['zero total', { days: 0, hours: 0 }],
    ['empty body', {}],
  ])('rejects %s with GENERIC_VALUE_OUT_OF_RANGE', (_name, input) => {
    const violations = violationsOf(input);

    expect(violations).not.toBeNull();
    expect(violations?.every((v) => v.code === GenericErrorCode.VALUE_OUT_OF_RANGE)).toBe(true);
  });
});
