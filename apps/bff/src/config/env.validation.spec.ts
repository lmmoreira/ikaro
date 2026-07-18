import { validateEnv } from './env.validation';

describe('validateEnv()', () => {
  const valid = {
    NODE_ENV: 'development',
    APP_ENV: 'local',
    PORT: '3002',
    BACKEND_INTERNAL_URL: 'http://localhost:3001',
    JWT_SECRET: 'a'.repeat(64),
    JWT_EXPIRES_IN: '7d',
    GOOGLE_CLIENT_ID: 'client-id.apps.googleusercontent.com',
    GOOGLE_CLIENT_SECRET: 'secret',
    GOOGLE_CALLBACK_URL: 'http://localhost:3002/v1/auth/google/callback',
    ALLOWED_ORIGINS: 'http://localhost:3000',
    FRONTEND_URL: 'http://localhost:3000',
    INTERNAL_API_KEY: 'c'.repeat(32),
  };

  it('returns parsed env when all required vars are present and valid', () => {
    const result = validateEnv(valid);
    expect(result.PORT).toBe(3002);
    expect(result.APP_ENV).toBe('local');
    expect(result.FRONTEND_URL).toBe('http://localhost:3000');
    expect(result.LOG_LEVEL).toBe('INFO');
    expect(result.LOG_VENDOR).toBe('gcp');
  });

  it('throws when a required var is missing', () => {
    const withoutSecret = Object.fromEntries(
      Object.entries(valid).filter(([k]) => k !== 'JWT_SECRET'),
    );
    expect(() => validateEnv(withoutSecret)).toThrow('ENV validation failed');
  });

  it('throws when JWT_SECRET is too short', () => {
    expect(() => validateEnv({ ...valid, JWT_SECRET: 'short' })).toThrow('ENV validation failed');
  });

  it('throws when APP_ENV=production and ENABLE_DEV_AUTH=true', () => {
    expect(() =>
      validateEnv({
        ...valid,
        APP_ENV: 'production',
        ENABLE_DEV_AUTH: 'true',
      }),
    ).toThrow('ENABLE_DEV_AUTH=true is not allowed when APP_ENV=production');
  });

  it('accepts ENABLE_DEV_AUTH=true in staging', () => {
    const result = validateEnv({
      ...valid,
      APP_ENV: 'staging',
      ENABLE_DEV_AUTH: 'true',
    });
    expect(result.APP_ENV).toBe('staging');
  });

  it('accepts optional GCP_PROJECT for Cloud Logging trace correlation', () => {
    const result = validateEnv({
      ...valid,
      GCP_PROJECT: 'ikaro-staging',
    });
    expect(result.GCP_PROJECT).toBe('ikaro-staging');
  });

  it('accepts LOG_VENDOR=none to disable vendor-specific log fields', () => {
    const result = validateEnv({
      ...valid,
      LOG_VENDOR: 'none',
    });
    expect(result.LOG_VENDOR).toBe('none');
  });

  it('defaults BACKEND_AUTH_MODE to none', () => {
    const result = validateEnv(valid);
    expect(result.BACKEND_AUTH_MODE).toBe('none');
  });

  it('throws when NODE_ENV=production and BACKEND_AUTH_MODE=none', () => {
    expect(() =>
      validateEnv({
        ...valid,
        NODE_ENV: 'production',
      }),
    ).toThrow('BACKEND_AUTH_MODE must be "iam" when NODE_ENV=production');
  });

  it('accepts NODE_ENV=production when BACKEND_AUTH_MODE=iam', () => {
    const result = validateEnv({
      ...valid,
      NODE_ENV: 'production',
      BACKEND_AUTH_MODE: 'iam',
    });
    expect(result.BACKEND_AUTH_MODE).toBe('iam');
  });

  it('accepts BACKEND_AUTH_MODE=none when NODE_ENV is not production', () => {
    const result = validateEnv({
      ...valid,
      NODE_ENV: 'staging',
      BACKEND_AUTH_MODE: 'none',
    });
    expect(result.BACKEND_AUTH_MODE).toBe('none');
  });

  it('accepts an optional BACKEND_AUDIENCE override', () => {
    const result = validateEnv({
      ...valid,
      BACKEND_AUDIENCE: 'https://backend-run-url.a.run.app',
    });
    expect(result.BACKEND_AUDIENCE).toBe('https://backend-run-url.a.run.app');
  });
});
