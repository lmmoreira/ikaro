import { isOtelSdkDisabled } from './otel-sdk-disabled';

describe('isOtelSdkDisabled', () => {
  it('defaults to disabled when APP_ENV is unset (matches the schema default of "local")', () => {
    expect(isOtelSdkDisabled({})).toBe(true);
  });

  it('defaults to disabled when APP_ENV is "local"', () => {
    expect(isOtelSdkDisabled({ APP_ENV: 'local' })).toBe(true);
  });

  it('defaults to enabled when APP_ENV is "staging"', () => {
    expect(isOtelSdkDisabled({ APP_ENV: 'staging' })).toBe(false);
  });

  it('defaults to enabled when APP_ENV is "production"', () => {
    expect(isOtelSdkDisabled({ APP_ENV: 'production' })).toBe(false);
  });

  it('an explicit OTEL_SDK_DISABLED=true wins even in staging/production', () => {
    expect(isOtelSdkDisabled({ APP_ENV: 'production', OTEL_SDK_DISABLED: 'true' })).toBe(true);
  });

  it('an explicit OTEL_SDK_DISABLED=false wins even locally (e.g. testing against `pnpm obs`)', () => {
    expect(isOtelSdkDisabled({ APP_ENV: 'local', OTEL_SDK_DISABLED: 'false' })).toBe(false);
  });

  it('treats any OTEL_SDK_DISABLED value other than the string "true" as false, once explicitly set', () => {
    expect(isOtelSdkDisabled({ APP_ENV: 'production', OTEL_SDK_DISABLED: 'nope' })).toBe(false);
  });
});
