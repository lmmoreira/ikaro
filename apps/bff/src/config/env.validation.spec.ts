import { validateEnv } from './env.validation';

describe('validateEnv()', () => {
  const valid = {
    NODE_ENV: 'development',
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
    expect(result.FRONTEND_URL).toBe('http://localhost:3000');
    expect(result.LOG_LEVEL).toBe('INFO');
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

  it('accepts optional GCP_PROJECT for Cloud Logging trace correlation', () => {
    const result = validateEnv({
      ...valid,
      GCP_PROJECT: 'ikaro-staging',
    });
    expect(result.GCP_PROJECT).toBe('ikaro-staging');
  });
});
