import { BadRequestException } from '@nestjs/common';
import { z, ZodIssue } from 'zod';
import { EmailErrorCode, GenericErrorCode, ValidationViolation } from '@ikaro/types';
import { deriveViolation, ZodValidationPipe } from './zod-validation.pipe';

describe('ZodValidationPipe', () => {
  it('returns parsed data when the payload is valid', () => {
    const pipe = new ZodValidationPipe(
      z.object({
        email: z.string().email(),
        tenantId: z.string().uuid(),
      }),
    );

    expect(
      pipe.transform({
        email: 'joao@example.com',
        tenantId: '10000000-0000-4000-8000-000000000001',
      }),
    ).toEqual({
      email: 'joao@example.com',
      tenantId: '10000000-0000-4000-8000-000000000001',
    });
  });

  it('throws a BadRequestException with validation violations when the payload is invalid', () => {
    const pipe = new ZodValidationPipe(
      z.object({
        email: z.string().email(),
        tenantId: z.string().uuid(),
      }),
    );

    expect(() => pipe.transform({ email: 'invalid', tenantId: 'not-a-uuid' })).toThrow(
      BadRequestException,
    );
  });

  it('violation entries carry field and code, not free-text message', () => {
    expect.assertions(2);
    const pipe = new ZodValidationPipe(z.object({ email: z.string().email() }));
    try {
      pipe.transform({ email: 'invalid' });
    } catch (e) {
      const body = (e as BadRequestException).getResponse() as Record<string, unknown>;
      const items = body['violations'] as ValidationViolation[];
      const violation = items.find((v) => v.field === 'email');
      expect(violation?.code).toBe(EmailErrorCode.FORMAT_INVALID);
      expect(violation).not.toHaveProperty('message');
    }
  });
});

function issueOf(overrides: Partial<ZodIssue> & { code: ZodIssue['code'] }): ZodIssue {
  return { path: ['field'], message: 'irrelevant', input: undefined, ...overrides } as ZodIssue;
}

describe('deriveViolation', () => {
  it('maps invalid_type to GenericErrorCode.FIELD_REQUIRED', () => {
    const v = deriveViolation(issueOf({ code: 'invalid_type', expected: 'string' }));
    expect(v).toEqual({ field: 'field', code: GenericErrorCode.FIELD_REQUIRED });
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

  it('maps invalid_format with format "email" to EmailErrorCode.FORMAT_INVALID', () => {
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
      issueOf({ code: 'custom', params: { code: 'ADDRESS_POSTAL_CODE_INVALID' } }),
    );
    expect(v).toEqual({ field: 'field', code: 'ADDRESS_POSTAL_CODE_INVALID' });
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

  it('throws for an unrecognized issue code instead of silently defaulting', () => {
    const unknownIssue = {
      code: 'some_future_zod_code',
      path: ['x'],
      message: 'm',
    } as unknown as ZodIssue;
    expect(() => deriveViolation(unknownIssue)).toThrow(/Unhandled Zod issue code/);
  });
});
