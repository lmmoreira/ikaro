import type { core } from 'zod';
import { EmailErrorCode, GenericErrorCode } from './error-codes';
import { deriveViolation } from './zod-violation';

type ZodIssue = core.$ZodIssue;

function issueOf(overrides: Partial<ZodIssue> & { code: ZodIssue['code'] }): ZodIssue {
  return { path: ['field'], message: 'irrelevant', input: undefined, ...overrides } as ZodIssue;
}

describe('deriveViolation', () => {
  it('maps invalid_type with no input (field missing entirely) to FIELD_REQUIRED', () => {
    const v = deriveViolation(
      issueOf({ code: 'invalid_type', expected: 'boolean', input: undefined }),
    );
    expect(v).toEqual({ field: 'field', code: GenericErrorCode.FIELD_REQUIRED });
  });

  it('maps invalid_type with a present-but-wrong-type input to VALUE_INVALID, not FIELD_REQUIRED', () => {
    const v = deriveViolation(
      issueOf({ code: 'invalid_type', expected: 'boolean', input: 'aslsdas' }),
    );
    expect(v).toEqual({ field: 'field', code: GenericErrorCode.VALUE_INVALID });
  });

  it('maps too_small (string origin) to VALUE_TOO_SHORT with minimum param', () => {
    const v = deriveViolation(
      issueOf({ code: 'too_small', origin: 'string', minimum: 3, inclusive: true }),
    );
    expect(v).toEqual({
      field: 'field',
      code: GenericErrorCode.VALUE_TOO_SHORT,
      params: { minimum: 3 },
    });
  });

  it('maps too_small (number origin) to VALUE_OUT_OF_RANGE', () => {
    const v = deriveViolation(
      issueOf({ code: 'too_small', origin: 'number', minimum: 1, inclusive: true }),
    );
    expect(v.code).toBe(GenericErrorCode.VALUE_OUT_OF_RANGE);
  });

  it('maps too_big (string origin) to VALUE_TOO_LONG with maximum param', () => {
    const v = deriveViolation(
      issueOf({ code: 'too_big', origin: 'string', maximum: 60, inclusive: true }),
    );
    expect(v).toEqual({
      field: 'field',
      code: GenericErrorCode.VALUE_TOO_LONG,
      params: { maximum: 60 },
    });
  });

  it('maps too_big (number origin) to VALUE_OUT_OF_RANGE', () => {
    const v = deriveViolation(
      issueOf({ code: 'too_big', origin: 'number', maximum: 10, inclusive: true }),
    );
    expect(v.code).toBe(GenericErrorCode.VALUE_OUT_OF_RANGE);
  });

  it('maps invalid_format to FORMAT_INVALID', () => {
    const v = deriveViolation(issueOf({ code: 'invalid_format', format: 'regex' }));
    expect(v.code).toBe(GenericErrorCode.FORMAT_INVALID);
  });

  it('maps invalid_format with format "email" to EmailErrorCode.FORMAT_INVALID (z.email() duplicates the Email VO rule)', () => {
    const v = deriveViolation(issueOf({ code: 'invalid_format', format: 'email' }));
    expect(v.code).toBe(EmailErrorCode.FORMAT_INVALID);
  });

  it('maps not_multiple_of to VALUE_OUT_OF_RANGE', () => {
    const v = deriveViolation(issueOf({ code: 'not_multiple_of', divisor: 15 }));
    expect(v.code).toBe(GenericErrorCode.VALUE_OUT_OF_RANGE);
  });

  it.each([
    'unrecognized_keys',
    'invalid_union',
    'invalid_key',
    'invalid_element',
    'invalid_value',
  ] as const)('maps %s to VALUE_INVALID', (code) => {
    const v = deriveViolation(issueOf({ code }));
    expect(v.code).toBe(GenericErrorCode.VALUE_INVALID);
  });

  it('maps a custom issue to the code supplied via params.code (VO-reuse case)', () => {
    const v = deriveViolation(
      issueOf({ code: 'custom', params: { code: 'PHONE_FORMAT_INVALID' } }),
    );
    expect(v).toEqual({ field: 'field', code: 'PHONE_FORMAT_INVALID' });
  });

  it('forwards additional string/number params from a custom issue alongside code', () => {
    const v = deriveViolation(
      issueOf({
        code: 'custom',
        params: { code: 'ADDRESS_FIELD_REQUIRED', field: 'street', ignoredObject: { x: 1 } },
      }),
    );
    expect(v).toEqual({
      field: 'field',
      code: 'ADDRESS_FIELD_REQUIRED',
      params: { field: 'street' },
    });
  });

  it('falls back to VALUE_INVALID for a custom issue missing params.code (schema-authoring bug)', () => {
    const v = deriveViolation(issueOf({ code: 'custom', params: { message: 'oops' } }));
    expect(v.code).toBe(GenericErrorCode.VALUE_INVALID);
  });

  it('falls back to VALUE_INVALID for a custom issue with no params at all', () => {
    const v = deriveViolation(issueOf({ code: 'custom' }));
    expect(v.code).toBe(GenericErrorCode.VALUE_INVALID);
  });

  it('throws for an unrecognized issue code instead of silently defaulting', () => {
    // Simulates a future Zod upgrade adding an issue code this function doesn't handle yet —
    // the cast is deliberate: real ZodIssue values can never have an unrecognized `code`.
    const unknownIssue = {
      code: 'some_future_zod_code',
      path: ['x'],
      message: 'm',
    } as unknown as ZodIssue;
    expect(() => deriveViolation(unknownIssue)).toThrow(/Unhandled Zod issue code/);
  });
});
