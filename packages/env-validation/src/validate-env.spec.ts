import { z } from 'zod';
import { validateEnvWithSchema } from './validate-env';

describe('validateEnvWithSchema()', () => {
  const schema = z.object({
    NAME: z.string().min(1, { message: 'NAME is required' }),
    PORT: z.coerce.number().default(3000),
  });

  it('returns parsed config when valid', () => {
    const result = validateEnvWithSchema(schema, { NAME: 'ikaro', PORT: '4000' });
    expect(result).toEqual({ NAME: 'ikaro', PORT: 4000 });
  });

  it('fills in schema defaults for fields not present in the input', () => {
    const result = validateEnvWithSchema(schema, { NAME: 'ikaro' });
    expect(result.PORT).toBe(3000);
  });

  it('throws a formatted error when a required field is missing', () => {
    expect(() => validateEnvWithSchema(schema, {})).toThrow('ENV validation failed');
  });

  it('includes the failing field path and custom message in the thrown error', () => {
    expect(() => validateEnvWithSchema(schema, { NAME: '' })).toThrow('NAME is required');
  });
});
