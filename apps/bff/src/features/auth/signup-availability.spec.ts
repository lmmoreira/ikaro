import { ConfigService } from '@nestjs/config';
import { assertSignupOpen, isSignupEnabled } from './signup-availability';

function configOf(values: Record<string, unknown>): ConfigService {
  return { get: (key: string) => values[key] } as unknown as ConfigService;
}

describe('signup kill switch (UC-127 A11)', () => {
  it.each([
    [{ FEATURE_FLAG_SIGNUP_ENABLED: true, APP_ENV: 'production' }, true],
    [{ FEATURE_FLAG_SIGNUP_ENABLED: false, APP_ENV: 'local' }, false],
    [{ APP_ENV: 'local' }, true],
    [{ APP_ENV: 'staging' }, true],
    // Unset in production fails closed: a deploy that loses the variable cannot open signup.
    [{ APP_ENV: 'production' }, false],
  ])('%j -> enabled=%s', (values, enabled) => {
    expect(isSignupEnabled(configOf(values))).toBe(enabled);
  });

  it('assertSignupOpen throws 503 only while closed', () => {
    expect(() => assertSignupOpen(configOf({ APP_ENV: 'local' }))).not.toThrow();
    expect(() => assertSignupOpen(configOf({ FEATURE_FLAG_SIGNUP_ENABLED: false }))).toThrow(
      expect.objectContaining({ status: 503 }),
    );
  });
});
