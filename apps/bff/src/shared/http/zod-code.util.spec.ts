import { z } from 'zod';
import { requiredWithCode } from './zod-code.util';

describe('requiredWithCode', () => {
  it('passes through a non-empty string unchanged', () => {
    const schema = requiredWithCode(z.string(), 'SOME_CODE');
    expect(schema.parse('hello')).toBe('hello');
  });

  it('passes a whitespace-only string, same as a plain .min(1) would (no trimming)', () => {
    const schema = requiredWithCode(z.string(), 'SOME_CODE');
    expect(schema.safeParse('   ').success).toBe(true);
  });

  it('fails an empty string and attaches the given code as params.code', () => {
    const schema = requiredWithCode(z.string(), 'SOME_CODE');
    const result = schema.safeParse('');
    expect(result.success).toBe(false);
    if (!result.success) {
      const issue = result.error.issues[0] as unknown as { params?: { code?: string } };
      expect(issue.params?.code).toBe('SOME_CODE');
    }
  });

  it('composes with an upper-bound .max() applied before it', () => {
    const schema = requiredWithCode(z.string().max(5), 'SOME_CODE');
    expect(schema.safeParse('123456').success).toBe(false);
    expect(schema.safeParse('').success).toBe(false);
    expect(schema.parse('abc')).toBe('abc');
  });
});
