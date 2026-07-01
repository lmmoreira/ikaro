import { BadRequestException } from '@nestjs/common';
import { z } from 'zod';
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
});
