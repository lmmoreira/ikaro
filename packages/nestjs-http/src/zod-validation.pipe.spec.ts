import { BadRequestException } from '@nestjs/common';
import { z } from 'zod';
import { GenericErrorCode, ValidationViolation } from '@ikaro/types';
import { ZodValidationPipe } from './zod-validation.pipe';

const schema = z.object({
  name: z.string().min(1),
  count: z.number(),
});

describe('ZodValidationPipe', () => {
  let pipe: ZodValidationPipe;

  beforeEach(() => {
    pipe = new ZodValidationPipe(schema);
  });

  it('returns the parsed value for valid input', () => {
    expect(pipe.transform({ name: 'Test', count: 3 })).toEqual({ name: 'Test', count: 3 });
  });

  it('throws BadRequestException for invalid input', () => {
    expect(() => pipe.transform({ name: '', count: 'not-a-number' })).toThrow(BadRequestException);
  });

  it('error response is a RFC 9457 Problem Detail with a violations array', () => {
    expect.assertions(4);
    try {
      pipe.transform({ name: '', count: 'oops' });
    } catch (e) {
      const body = (e as BadRequestException).getResponse() as Record<string, unknown>;
      expect(body['type']).toBe('about:blank');
      expect(body['status']).toBe(400);
      expect(body['title']).toBe('Bad Request');
      expect(Array.isArray(body['violations'])).toBe(true);
    }
  });

  it("violation entries carry field and code, not free-text message — derivation itself is covered by @ikaro/types' zod-violation.spec.ts", () => {
    expect.assertions(2);
    try {
      pipe.transform({ name: 'ok' });
    } catch (e) {
      const body = (e as BadRequestException).getResponse() as Record<string, unknown>;
      const items = body['violations'] as ValidationViolation[];
      const violation = items.find((v) => v.field === 'count');
      expect(violation?.code).toBe(GenericErrorCode.FIELD_REQUIRED);
      expect(violation).not.toHaveProperty('message');
    }
  });

  it('works with @Query-bound schemas the same way as @Body-bound ones', () => {
    const queryPipe = new ZodValidationPipe(z.object({ email: z.string().email() }));
    expect.assertions(2);
    try {
      queryPipe.transform({ email: 'invalid' });
    } catch (e) {
      const body = (e as BadRequestException).getResponse() as Record<string, unknown>;
      const items = body['violations'] as ValidationViolation[];
      expect(items).toHaveLength(1);
      expect(items[0]?.field).toBe('email');
    }
  });
});
