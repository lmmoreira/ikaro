import { BadRequestException } from '@nestjs/common';
import { z } from 'zod';
import { EmailErrorCode, ValidationViolation } from '@ikaro/types';
import { ZodValidationPipe } from './zod-validation.pipe';

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

  it("violation entries carry field and code, not free-text message — derivation itself is covered by @ikaro/types' zod-violation.spec.ts", () => {
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
